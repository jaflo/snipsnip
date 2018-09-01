const player = (() => {
	let fadeIn, fadeOut, reverse,				// GainNodes to fade in/out and reverse audio
		transitionDuration, totalLength,		// length of the overlap and total length
		shortenedLength, inTime, outTime,		// time to fade in and out
		startLoopTime, endLoopTime, loopAround,	// how much to pad the loop by
		onlyShowShorterThan = false,			// filters
		audioCtx, buffer, bufferReverse,		// audio data
		first, second,							// buffer sources of song
		zeroIsAt = 0,							// time relative to audio context
		response = {}, key,						// API result
		playing = false, looping = false,		// state
		submittedFeedback = false;				// have they submitted feedback?

	const scrubber = $(".player .scrubber input");
	const resultList = $("#results .list");
	const exportButton = $(".more .export");
	const loopToggleButton = $(".more .loop");
	const prevButton = $(".controls .prev");
	const nextButton = $(".controls .next");
	const playButton = $(".controls .play");
	const loopedRegionIndicator = $(".player .scrubber .transition .loop");
	const columnHeaders = $(".header > div > div");
	const filter = $(".filter");

	const circledPauseClass = "icon-pause-circled";
	const normalPlayClass = "icon-play-circled";
	const playIcon = ".play i";
	const selectedRow = ".selected.row";
	const rowSelector = ".row";
	const sampleRowSelector = ".sample";

	const toMins = (seconds) => parseInt(seconds/60)+":"+("00"+parseInt(seconds%60)).substr(-2);

	const init = (file, callback, fail) => {
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		audioCtx = new AudioContext();

		player.pause();

		audioCtx.decodeAudioData(file, (data) => {
			buffer = data;
			totalLength = buffer.duration;
			callback(buffer);
		}, (e) => {
			fail(e.err);
		});
	}

	const createRewindBuffer = () => {
		bufferReverse = new AudioBuffer({
			length: buffer.length,
			numberOfChannels: buffer.numberOfChannels,
			sampleRate: buffer.sampleRate,
		});
		for (let i = 0; i < buffer.numberOfChannels; i++) {
			let rev = Array.prototype.reverse.call(buffer.getChannelData(i).slice(0));
			bufferReverse.copyToChannel(rev, i);
		}
	}

	const getLength = () => totalLength;
	const anythingSelected = () => resultList.find(selectedRow).length > 0;

	const setup = (i, o, d, l) => {
		inTime = parseFloat(i);
		outTime = parseFloat(o);
		transitionDuration = d;
		shortenedLength = l;

		$(".player .scrubber .transition .marker").css({
			left: inTime/shortenedLength*100+"%",
			width: transitionDuration/shortenedLength*100+"%",
		});

		scrubber.attr("max", shortenedLength).val(0);

		return player;
	}

	const playAt = (playFrom) => {
		if (audioCtx.state === "suspended") {
			audioCtx.resume().then(() => {
				playAt(playFrom);
			});
			return;
		}

		playFrom = Math.max(0, parseFloat(playFrom));

		first = audioCtx.createBufferSource();
		second = audioCtx.createBufferSource();
		first.buffer = second.buffer = buffer;

		if (fadeOut) fadeOut.disconnect();
		if (fadeIn) fadeIn.disconnect();

		fadeOut = audioCtx.createGain();
		fadeIn = audioCtx.createGain();

		first.connect(fadeOut);
		fadeOut.connect(audioCtx.destination);

		second.connect(fadeIn);
		fadeIn.connect(audioCtx.destination);

		let t = audioCtx.currentTime;
		zeroIsAt = t - playFrom;

		fadeOut.gain.value = fadeIn.gain.value = 0;
		if (playFrom <= inTime) {
			fadeOut.gain.value = 1;
			fadeOut.gain.setValueAtTime(1, t+inTime-playFrom-transitionDuration);
			fadeOut.gain.linearRampToValueAtTime(0, t+inTime-playFrom);
			first.start(t, playFrom, inTime-playFrom);

			fadeIn.gain.value = 0;
			fadeIn.gain.setValueAtTime(0, t+inTime-playFrom-transitionDuration);
			fadeIn.gain.linearRampToValueAtTime(1, t+inTime-playFrom);
			second.start(t, outTime-inTime+playFrom+transitionDuration);
		} else {
			if (looping) loopToggleButton.click();
			fadeIn.gain.value = 1;
			second.start(t, outTime+playFrom-inTime);
		}

		scrubber.val(playFrom);
		playing = true;
		playButton.attr("title", "Pause").find("i").removeClass().addClass("icon-pause");
		$(".selected.row .play i").addClass(circledPauseClass);
		exportButton.removeClass("off");
		$(".player .scrubber .transition").toggle(inTime != 0);
		ga("send", "event", "Player", "play");
	}

	const reverseRange = (from, to) => {
		from = parseFloat(from);
		to = parseFloat(to);

		if (reverse) reverse.disconnect();
		playing = false;

		if (bufferReverse) {
			reverse = audioCtx.createBufferSource();
			reverse.buffer = bufferReverse;
			reverse.playbackRate.value = 1.5;
			reverse.connect(audioCtx.destination);

			let silence = 0.3;
			reverse.start(audioCtx.currentTime, totalLength-to+silence/2, (0.6-silence)*reverse.playbackRate.value);
		}
	}

	const playRange = (start, end) => {
		startLoopTime = parseFloat(start);
		endLoopTime = parseFloat(end);

		loopedRegionIndicator.css({
			left: Math.max(0, startLoopTime/shortenedLength)*100+"%",
			right: Math.min(1, (shortenedLength-endLoopTime)/shortenedLength)*100+"%",
		}).toggle(looping);

		playAt(start);
	}

	const ensureSelectedRowVisible = () => {
		$(".selected.row .viewportalign").focus().blur();
	}

	let loopBackLater;
	const loopBack = () => {
		loopToggleButton.addClass("ed");
		if (loopBackLater) clearTimeout(loopBackLater);
		loopBackLater = setTimeout(() => {
			playAt(startLoopTime);
			loopToggleButton.removeClass("ed");
		}, 600);
		pause();
		reverseRange(scrubber.val(), startLoopTime);
	}

	const attachEventListeners = () => {
		setInterval(() => {
			if (!playing) return;
			let relativeT = audioCtx.currentTime - zeroIsAt;
			if (!scrubbing && !freeze) scrubber.val(relativeT);
			if (relativeT > shortenedLength) looping ? loopBack() : pause();
			if (looping && relativeT >= endLoopTime) loopBack();
		}, 100);

		let debouncedScrub = false, scrubbing = false, freeze = false;
		scrubber.change(() => {
			if (debouncedScrub) clearTimeout(debouncedScrub);
			scrubbing = true;
			debouncedScrub = setTimeout(() => {
				player.playAt(scrubber.val());
				scrubbing = false;
			}, 200);
			ga("send", "event", "UI features", "scrub");
		}).mouseover(() => freeze = true).mouseout(() => freeze = false);

		$(document).keydown(function(e) {
			if (e.ctrlKey || e.shiftKey || e.altKey || $(e.target).is("input[type=text], input[type=radio], textarea")) return;
			switch (e.which) {
				case 37: // left
				case 38: // up
					if ($(e.target).is("input[type=range]")) return;
					prevButton.click();
				break;

				case 39: // right
				case 40: // down
					if ($(e.target).is("input[type=range]")) return;
					nextButton.click();
				break;

				case 32: // space
					if ($(e.target).is("button")) return;
					playButton.click();
				break;

				case 76: // L
					loopToggleButton.click();
				break;

				default:
					return;
			}
			ga("send", "event", "UI features", "keyboard");
			e.preventDefault();
		});

		playButton.click((e) => {
			if ($(".controls .play i").hasClass("icon-play")) {
				if (anythingSelected()) {
					playAt(scrubber.val());
				} else {
					resultList.find(rowSelector).first().click();
				}
			} else {
				pause();
			}
		});

		prevButton.click(() => {
			force = true;
			if (anythingSelected()) {
				let before = resultList.find(selectedRow).prev(rowSelector).not(sampleRowSelector);
				if (before.length > 0) before.click();
				else pause();
			} else {
				resultList.find(rowSelector).last().click();
			}
			ensureSelectedRowVisible();
		});

		nextButton.click(() => {
			force = true;
			if (anythingSelected()) {
				let after = resultList.find(selectedRow).next(rowSelector);
				if (after.length > 0) after.click();
				else pause();
			} else {
				playButton.click();
			}
			ensureSelectedRowVisible();
		});

		loopToggleButton.click(() => {
			looping = !looping;
			loopToggleButton.toggleClass("off", !looping).attr("title", "Loop "+(looping ? "on" : "off"));
			loopedRegionIndicator.toggle(looping);
			ga("send", "event", "UI features", "loop");
		});

		exportButton.click(() => {
			if (exportButton.hasClass("off") || exportButton.hasClass("ing")) return;

			let selected = resultList.find(selectedRow);
			exportButton.addClass("ing");

			api.exportFile(
				key, response.overlap,
				selected.data("in"),
				selected.data("out"),
			).then((data) => {
				var link = document.createElement("a");
				link.href = data.url;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				exportButton.removeClass("ing");
				ga("send", "event", "File process", "download");
			});

			if (!submittedFeedback) {
				$("#results").removeClass("open").addClass("gone");
				$("#feedback").addClass("open");
				pause();
			}

			ga("send", "event", "File process", "export");
		});

		$("#feedback form").on("submit", () => {
			submittedFeedback = true;
			$("#feedback .cancel").click();
			$(".feedback").addClass("collected");
			ga("send", "event", "Feedback", "submit");
		});

		$("#feedback .cancel").click((e) => {
			$("#feedback").removeClass("open").addClass("gone");
			$("#results").removeClass("gone").addClass("open");
			ga("send", "event", "Feedback", "dismiss");
			e.preventDefault();
			return false;
		});

		let force = false;

		resultList.on("click", rowSelector, (e) => {
			const $self = $(e.currentTarget),
				thisWasPlaying = $self.find(playIcon).hasClass(circledPauseClass);
			resultList.find(playIcon).removeClass().addClass(normalPlayClass);
			if (loopBackLater) clearTimeout(loopBackLater);

			if (thisWasPlaying && !force) {
				player.pause();
			} else {
				resultList.find(rowSelector).removeClass("selected");
				player.setup(
					$self.data("in"),
					$self.data("out"),
					response.overlap,
					$self.data("length")
				).playRange($self.data("in") - loopAround, parseFloat($self.data("in")) + loopAround);
				$self.addClass("selected").find(playIcon).addClass(circledPauseClass);
				force = false;
			}
		});


		filter.find("i").click(() => {
			filter.toggleClass("open");
			if (filter.hasClass("open")) {
				filter.find("input").focus().select();
				ga("send", "event", "UI features", "filter");
			}
		});

		filter.find("input").on("change keypress keyup", (e) => {
			const input = $(e.currentTarget).val();
			if (input.length == 0) {
				onlyShowShorterThan = false;
				filter.find(".convert").hide();
			} else {
				let seconds = parseInt(input);
				if (input.includes(":")) {
					let parts = input.split(":");
					seconds = parseInt(parts[0])*60+parseInt(parts[1] || 0);
					filter.find(".convert").text("("+seconds+" seconds)");
				} else {
					filter.find(".convert").text("("+player.toMins(seconds)+" minutes)");
				}
				filter.find(".convert").show();
				onlyShowShorterThan = seconds;
			}
			buildTable();
			if (e.which == 27) {
				// [esc] clears input
				filter.find("input").val("").change();
			}
			if (e.which == 13 || e.which == 27) {
				filter.find("input").blur();
				filter.removeClass("open");
			}
		});

		columnHeaders.click((e) => {
			let $self = $(e.currentTarget);
			let index = $self.data("index");
			if (typeof index == "undefined") return;

			columnHeaders.removeClass("desc asc")
			let order = $self.data("order") || "desc";

			if (order == "desc") {
				$self.addClass("asc").data("order", "asc");
				order = 1;
			} else {
				$self.addClass("desc").data("order", "desc");
				order = -1;
			}

			response.results.sort((a, b) => {
				if (a[index] < b[index])
					return -1*order;
				if (a[index] > b[index])
					return 1*order;
				return 0;
			});

			buildTable();
			ga("send", "event", "UI features", "sort");
		});

		$(".banner .close").click(() => {
			$(".banner").remove();
			ga("send", "event", "UI features", "banner dismiss");
		});

		$("#anotherone").click(() => {
			$("#results").removeClass("open");
			$("#wizard").removeClass("gone").height();
			$("#wizard").addClass("open");
			wizard.reset();
			pause();
			ga("send", "event", "UI features", "restart");
		});
	}

	const pause = () => {
		if (fadeOut) fadeOut.disconnect();
		if (fadeIn) fadeIn.disconnect();

		playing = false;
		playButton.attr("title", "Play").find("i").removeClass().addClass("icon-play");
		resultList.find(playIcon).removeClass().addClass(normalPlayClass);
	}

	const buildTable = () => {
		const sample = resultList.find(sampleRowSelector);
		let selected = resultList.find(selectedRow);
		if (selected.length == 0) {
			selected = false;
		} else {
			selected = selected.data("in")+" "+selected.data("out");
		}
		resultList.find(rowSelector).not(sampleRowSelector).remove();
		for (let i = 0; i < response.results.length; i++) {
			let row = sample.clone().removeClass("sample"),
				result = response.results[i];
			if (onlyShowShorterThan && result[1] > onlyShowShorterThan) continue;

			row.find(".length").text(toMins(result[1]));
			let similarity = row.find(".similarity").attr("title", "~"+parseInt((result[0]-1)*100)+"% similar");
			for (let j = 0; j < Math.ceil((result[0]-1)*5); j++) {
				similarity.append($("<div>"));
			}
			let length = player.getLength();
			if (result[2] == 0) {
				row.addClass("original");
				row.find(".transition").text("Original");
			} else {
				row.find(".transition").attr("title", toMins(result[2])+" cut to "+toMins(result[3]));
				row.find(".transition .a").width(result[2]/length*100+"%");
				row.find(".transition .b").width((1-result[3]/length)*100+"%");
			}
			row.data("in", result[2])
				.data("out", result[3])
				.data("length", result[1]);
			if (selected == result[2]+" "+result[3]) row.addClass("selected").find(playIcon).removeClass().addClass(circledPauseClass);
			resultList.append(row);
		}
	}

	const populate = (newKey, data) => {
		key = newKey;
		data.results.unshift([2, totalLength, 0, 0]);
		response = data;
		loopAround = response.overlap*4;
		buildTable();
	}

	return {
		attachEventListeners: attachEventListeners,
		init: init,
		createRewindBuffer: createRewindBuffer,
		getLength: getLength,
		setup: setup,
		pause: pause,
		playAt: playAt,
		playRange: playRange,
		populate: populate,
		toMins: toMins
	}
})();
