const wizard = (() => {
	const fileDropArea = $(".file .drop");
	const fileProcessingError = $(".file .error");
	const fileStep = $(".file");
	const wizardContainer = $("#wizard");
	const demoFileProgress = $("#samplefile .label div");

	const cancel = (e) => {
		e.preventDefault();
		return false;
	}

	const goto = (step) => {
		$("#wizard .step").removeClass("active");
		$("#wizard ."+step).addClass("active");
	}

	const failUpload = (message) => {
		fileProcessingError.text(message).show();
		fileProcessing = false;
	}

	let fileProcessing = false;
	const process = (files) => {
		ga("send", "event", "File process", "start");
		$(".demo .arrow").hide();
		if (fileProcessing) return;
		fileProcessing = true;

		fileProcessingError.hide();
		const file = files[0];

		if (files.length != 1) {
			failUpload("You have to select one file.");
		} else if (file.size > 100*1024*1024) {
			failUpload("The selected file is too large. Files have to be smaller than 100 MB.");
		} else if (file.type.split("/")[0] != "audio") {
			failUpload("The selected file isn't an audio file.");
		} else {
			fileStep.addClass("processing");
			const reader = new FileReader();
			reader.addEventListener("loadend", (e) => {
				player.init(e.target.result, (buffer) => {
					if (buffer.duration > 60*8) {
						failUpload("The selected file is too long. Files have to be shorter than 8 minutes.");
						fileStep.removeClass("processing");
					} else {
						uploadAnalyze(file);
						player.createRewindBuffer();
					}
				}, () => {
					failUpload("Failed to read audio file. The selected file appears to be corrupted.");
				});
			});
			reader.readAsArrayBuffer(file);
		}
	}

	const uploadAnalyze = (file) => {
		var key, animation;
		api.requestUpload(file).then((data) => {
			fileStep.removeClass("processing");
			goto("upload");
			key = data.key;
			api.onfail(() => failUpload("An API error occured."));
			return api.upload(data.url, file, (progress) => $(".upload .progress div").width(progress+"%"));
		}).then(() => {
			return new Promise((resolve, reject) => {
				setTimeout(resolve, 300);
			});
		}).then(() => {
			ga("send", "event", "File process", "upload");
			$(".analysis").addClass("working");
			var t = 0, step = 300, max = 30*1000;
			animation = setInterval(() => {
				$(".analysis .progress div").width((t/(max/step)*100)+"%");
				t++;
			}, step);
			goto("analysis");
			api.onfail((ex) => $(".analysis .error").text(ex).show());
			return api.analyze(key);
		}).then((data) => {
			ga("send", "event", "File process", "analysis");
			clearInterval(animation);
			$(".analysis .progress div").width("100%");
			player.populate(key, data.data);
			$(".header .length").attr("data-order", "asc").click();
			wizardContainer.removeClass("open").addClass("gone");
			$("#results").addClass("open").height();
			$("#results .list").addClass("in");
			setTimeout(() => {
				$(".above").addClass("ask");
			}, 6000);
		}).catch((ex) => {
			console.error(ex);
		});
	}

	const reset = () => {
		goto("file");
		fileProcessing = false;
		wizardContainer.find(".progress div").hide().width(0);
		wizardContainer.find(".progress div").show();
	}

	const init = () => {
		if (
			(window.AudioContext || window.webkitAudioContext) &&
			self.fetch && window.FileReader &&
			"draggable" in document.createElement("b")
		) {
			$(".demo .arrow").addClass("enter");
			setTimeout(() => $(".demo .arrow").addClass("show"), 500);
			attachEventListeners();
			$("#init").removeClass("open").addClass("gone");
			wizardContainer.addClass("open");
		} else {
			$("#init").removeClass("open").addClass("gone");
			$("#outdated").addClass("open");
			ga("send", "event", "Outdated");
		}
	}

	const attachEventListeners = () => {
		$(".feedback .options a").click(() => {
			$(".feedback").addClass("collected");
			ga("send", "event", "Feedback", "click");
		});

		$(".file .drop input").on("change", (e) => {
			process(e.target.files);
			ga("send", "event", "UI features", "file select manually");
			return cancel(e);
		});
		$(".file .drop .manual button").click(() => $(".file .drop input").click());

		let noDragFlicker;
		$("#application").on("drop", (e) => {
			$(".demo .arrow").hide();
			fileDropArea.removeClass("over");
			if (e.dataTransfer.files.length > 0) {
				ga("send", "event", "UI features", "file drop");
				process(e.dataTransfer.files);
			} else {
				const url = e.dataTransfer.getData("Text");
				if (!url) return;
				ga("send", "event", "UI features", "demo drop");
				const text = $(".demo p").text(),
					loadingMessage = setTimeout(() => {
						$(".demo p").text("Downloading the file, this might take a bit...");
					}, 1000);
				demoFileProgress.width(0).show();
				api.getFile(url, (progress) => demoFileProgress.width(progress+"%")).then((file) => {
					demoFileProgress.hide();
					$(".demo p").text(text);
					clearTimeout(loadingMessage);
					process([file])
				});
			}
			return cancel(e);
		}).on("dragenter dragover", (e) => {
			fileDropArea.addClass("over");
			clearTimeout(noDragFlicker);
			cancel(e);
		}).on("dragleave", () => {
			clearTimeout(noDragFlicker);
			noDragFlicker = setTimeout(() => fileDropArea.removeClass("over"), 100);
		});

		$("#samplefile").click((e) => {
			e.preventDefault();
			ga("send", "event", "UI features", "demo file click");
			$(".demo .em").toggleClass("look");
		}).on("dragstart", (e) => e.dataTransfer.setData("Text", e.target.href));
	}

	return {
		init: init,
		reset: reset
	}
})();
