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
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
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
