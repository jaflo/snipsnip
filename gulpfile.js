var gulp = require("gulp");
var htmlmin = require("gulp-htmlmin");
var concat = require("gulp-concat");
var babel = require("gulp-babel");
var uglify = require("gulp-uglify");
var sass = require("gulp-sass");
var minifyCSS = require("gulp-csso");
var autoprefixer = require("gulp-autoprefixer");
var replace = require("gulp-replace");
var sourcemaps = require("gulp-sourcemaps");

gulp.task("html", function() {
	return gulp.src("src/*.html")
		.pipe(gulp.dest("dist"))
});

gulp.task("js", function() {
	return gulp.src(["src/js/min/*.js", "src/js/*.js"])
		.pipe(concat("scripts.js"))
		.pipe(sourcemaps.init())
		.pipe(babel({
			presets: ["es2015"]
		}))
		.pipe(concat("scripts.js"))
		.pipe(uglify({
			compress: {
				passes: 2,
				pure_getters: true,
				inline: true
			},
			mangle: {
				toplevel: true
			}
		}))
		.pipe(sourcemaps.write("map"))
		.pipe(gulp.dest("dist"))
});

gulp.task("css", function() {
	return gulp.src(["src/css/*-embedded.css", "src/*.scss"])
		.pipe(concat("style.css"))
		.pipe(replace(/\.\.\/font\//g, ''))
		.pipe(sass())
		.pipe(autoprefixer({
			browsers: ["last 2 versions"],
			cascade: false
		}))
		.pipe(minifyCSS())
		.pipe(gulp.dest("dist"))
});

gulp.task("assets", function() {
	return gulp.src([
			"src/audio.mp3",
			"src/*.png",
			"src/*.svg",
			"src/font/*",
			"assets/banner.png",
			"assets/logo.png"
		])
		.pipe(gulp.dest("dist"))
});

gulp.task("bundle", function() {
	var cachebust = "?cb="+(Math.random()+"").slice(-8);
	return gulp.src("src/*.html")
		.pipe(replace(/<link rel="stylesheet" href="[^"]*">/g, ''))
		.pipe(replace('<!-- INJECT_STYLES -->', '<link rel="stylesheet" href="style.css'+cachebust+'" />'))
		.pipe(replace(/<script src="[^"]*"><\/script>/g, ''))
		.pipe(replace('<!-- INJECT_SCRIPTS -->', '<script src="scripts.js'+cachebust+'"></script>'))
		.pipe(htmlmin({
			removeComments: true,
			collapseWhitespace: true
		}))
		.pipe(gulp.dest("dist"))
});

gulp.task("default", gulp.series("html", "js", "css", "assets", "bundle"));
