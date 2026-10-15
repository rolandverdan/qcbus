/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const logger = require("firebase-functions/logger");
const {
	onDocumentCreated,
	onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

exports.sendCommuterInboxNotification = onDocumentCreated(
	"notifications/{notificationId}",
	async (event) => {
		const notification = event.data?.data();
		const userId = notification?.userId;

		if (!userId || notification.read) return;

		const tokenSnapshot = await admin
			.firestore()
			.collection("users")
			.doc(userId)
			.collection("pushTokens")
			.get();

		if (tokenSnapshot.empty) return;

		const tokenDocuments = tokenSnapshot.docs.filter(
			(tokenDocument) => Boolean(tokenDocument.data().token)
		);
		const tokenValues = tokenDocuments.map(
			(tokenDocument) => tokenDocument.data().token
		);

		if (!tokenValues.length) return;

		const response = await admin.messaging().sendEachForMulticast({
			tokens: tokenValues,
			notification: {
				title: notification.title || "QCommute",
				body: notification.message || "You have a new notification.",
			},
			data: {
				notificationId: event.params.notificationId,
				type: notification.type || "general",
				url: "https://qcommute-88bf5.web.app/commuters/index.html#notifications",
			},
			webpush: {
				notification: {
					icon: "https://qcommute-88bf5.web.app/images/qclogo2.png",
					badge: "https://qcommute-88bf5.web.app/images/qclogo2.png",
					tag: `qc-notification-${event.params.notificationId}`,
				},
				fcmOptions: {
					link: "https://qcommute-88bf5.web.app/commuters/index.html#notifications",
				},
			},
		});

		const invalidTokenCodes = new Set([
			"messaging/registration-token-not-registered",
			"messaging/invalid-registration-token",
		]);
		const invalidTokenDocuments = response.responses.flatMap(
			(result, index) =>
				!result.success && invalidTokenCodes.has(result.error?.code)
					? [tokenDocuments[index]]
					: []
		);

		await Promise.all(
			invalidTokenDocuments.map((tokenDocument) => tokenDocument.ref.delete())
		);

		logger.info("Commuter push delivery completed", {
			notificationId: event.params.notificationId,
			successCount: response.successCount,
			failureCount: response.failureCount,
			removedExpiredTokens: invalidTokenDocuments.length,
		});
	}
);

async function createCommuterNotifications(userIds, notification) {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
	const db = admin.firestore();

	for (let offset = 0; offset < uniqueUserIds.length; offset += 450) {
		const batch = db.batch();
		uniqueUserIds.slice(offset, offset + 450).forEach((userId) => {
			const ref = db.collection("notifications").doc();
			batch.set(ref, {
				userId,
				...notification,
				read: false,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
			});
		});
		await batch.commit();
	}
}

async function notifySavedRouteCommuters(routeId, notification) {
	if (!routeId) return;
	const users = await admin.firestore().collection("users").get();
	const matchingUserIds = users.docs
		.filter((user) => (user.data().savedRoutes || []).includes(routeId))
		.map((user) => user.id);
	await createCommuterNotifications(matchingUserIds, notification);
}

exports.notifyCommuterWhenReportStatusChanges = onDocumentUpdated(
	"reports/{reportId}",
	async (event) => {
		const before = event.data?.before.data();
		const after = event.data?.after.data();
		if (!before || !after || before.status === after.status || !after.reporterId) return;

		const statusMessages = {
			reviewing: {
				title: "Your report is being reviewed",
				message: "The team has started reviewing your report.",
			},
			resolved: {
				title: "Your report was resolved",
				message: "The issue you reported has been marked as resolved.",
			},
			dismissed: {
				title: "Your report was closed",
				message: "The team closed your report. Open My Reports to view its status.",
			},
			pending: {
				title: "Your report is open again",
				message: "Your report has been reopened for follow-up.",
			},
		};
		const content = statusMessages[after.status];
		if (!content) return;

		await createCommuterNotifications([after.reporterId], {
			...content,
			type: "report",
			reportId: event.params.reportId,
			status: after.status,
		});
	}
);

exports.notifyCommutersWhenTripStarts = onDocumentCreated(
	"trips/{tripId}",
	async (event) => {
		const trip = event.data?.data();
		if (!trip || trip.status !== "active" || !trip.routeId) return;

		const busCode = trip.busCode || "A bus";
		await notifySavedRouteCommuters(trip.routeId, {
			title: "Bus service has started",
			message: `${busCode} is now active on your saved route.`,
			type: "bus",
			busCode,
			routeId: trip.routeId,
			tripId: event.params.tripId,
		});
	}
);

exports.notifyCommutersAboutTripChanges = onDocumentUpdated(
	"trips/{tripId}",
	async (event) => {
		const before = event.data?.before.data();
		const after = event.data?.after.data();
		if (!before || !after) return;

		const routeId = after.routeId || before.routeId;
		const busCode = after.busCode || before.busCode || "your bus";
		let notification = null;

		if (before.status !== after.status && after.status === "active") {
			notification = {
				title: "Bus service has started",
				message: `${busCode} is now active on your saved route.`,
				type: "bus",
			};
		} else if (before.status === "active" && after.status !== "active") {
			notification = {
				title: "Bus service has ended",
				message: `${busCode} has ended its trip on your saved route.`,
				type: "bus",
			};
		} else {
			const capacity = Number(after.capacity) || 0;
			const wasFull = Number(before.onboard) >= Number(before.capacity) && Number(before.capacity) > 0;
			const isFull = capacity > 0 && Number(after.onboard) >= capacity;
			if (!wasFull && isFull && after.status === "active") {
				notification = {
					title: "Bus is at capacity",
					message: `${busCode} on your saved route is currently full.`,
					type: "bus",
				};
			}
		}

		if (notification) {
			await notifySavedRouteCommuters(routeId, {
				...notification,
				routeId,
				busCode,
				tripId: event.params.tripId,
			});
		}
	}
);
