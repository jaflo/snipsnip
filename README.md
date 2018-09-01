# snipsnip

Seamlessly shorten songs. No cut ends! Live on https://kurz.app/

## Overview

This is a web service that allows users to shorten a song without cutting off the end. Instead, similar portions of audio are identified and cross-faded to produce a new song that retains the start and end of the original song with a middle portion removed.

## Implementation

The front-end is a static website hosted on S3 and communicates with endpoints on AWS that call Python functions run on Lambda to process files. The [serverless](https://serverless.com/) framework is used to make deployment easy. [gulp](https://gulpjs.com/) is used to build the front-end (compiling the ES6 code and Sass files and minifying them for production).

## Deployment

Make any changes you need to, make sure serverless is set up and run `npm run deploy`. You may also find the following commands helpful:

* `npm run serve` to run an HTTP server (for front-end work)
* `npm run dev` to recompile Sass files when changed
* `npm run build` to build the front-end
* `npm run deploy` to build and upload the entire project to AWS
* `npm run deploy-web` to build and update just the static website

## Included software

* slimmed-down copy of [pyAudioAnalysis](https://github.com/tyiannak/pyAudioAnalysis)
* custom [Zepto](https://zeptojs.com/) build (using `MODULES="zepto event ie" ./make dist`)
* [Elusive Icons](http://elusiveicons.com/) built using [Fontello](http://fontello.com/)
* [ffmpeg](https://www.ffmpeg.org/) builds for Lambda
