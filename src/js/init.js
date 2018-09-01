$(document).ready(() => {
	ga("create", "UA-104916266-2", "auto");
	ga("send", "pageview");

	Raven.config("https://1785ced2548545e8bcd89f05f0c63bfb@sentry.io/1255218").install();
	Raven.context(() => {
		setTimeout(() => {
			wizard.init();
		}, 500);
		player.attachEventListeners();

		if (window.performance) {
			ga("send", "timing", "Dependencies", "load", Math.round(performance.now()));
		}
	});

	if (window.performance) {
		ga("send", "timing", "Dependencies", "DOMready", Math.round(performance.now()));
	}
});
