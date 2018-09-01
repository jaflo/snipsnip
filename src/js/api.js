const api = (() => {
	const base = "https://flx0wig82l.execute-api.us-east-1.amazonaws.com/prod";
	let failureHandler = () => {};

	const error = (ex) => {
		console.error(ex);
		failureHandler(ex);
	}

	const onfail = (fail) => failureHandler = fail;

	const checkResponse = (data) => {
		if (data.success) return data;
		else throw data.message;
	}

	const requestUpload = (file) => {
		return fetch(base+"/upload", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				name: file.name,
				type: file.type,
				_: Math.random()
			})
		}).then((response) => response.json()).then(checkResponse).catch(error);
	}

	const upload = (url, file, step) => {
		return new Promise((resolve, reject) => {
			var request = new XMLHttpRequest();
			request.upload.addEventListener("progress", (e) => {
				if (e.lengthComputable) step(e.loaded/e.total*100);
			});
			request.upload.addEventListener("load", () => {
				resolve();
			});
			request.open("PUT", url);
			request.overrideMimeType(file.type);
			request.send(file);
		});
	}

	const getFile = (url, step) => {
		return new Promise((resolve, reject) => {
			var request = new XMLHttpRequest();
			request.addEventListener("progress", (e) => {
				if (e.lengthComputable) step(e.loaded/e.total*100);
			});
			request.addEventListener("load", () => {
				let file = request.response;
				file.lastModifiedDate = new Date();
			    file.name = url.split("/").slice(-1)[0];
				resolve(file);
			});
			request.open("GET", url);
			request.responseType = "blob";
			request.send();
		});
	}

	const analyze = (key) => {
		return fetch(base+"/analyze", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				key: key
			})
		}).then((response) => response.json()).then(checkResponse).catch(error);
	}

	const exportFile = (key, overlap, a, b) => {
		return fetch(base+"/export", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				key: key,
				overlap: parseFloat(overlap),
				a: parseFloat(a),
				b: parseFloat(b),
				nodip: true
			})
		}).then((response) => response.json()).then(checkResponse).catch(error);
	}

	return {
		onfail: onfail,
		requestUpload: requestUpload,
		upload: upload,
		analyze: analyze,
		exportFile: exportFile,
		getFile: getFile,
	}
})();
