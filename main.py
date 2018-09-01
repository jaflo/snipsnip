#!/usr/bin/env python3
import os
import numpy as np
import math
import sys
import time
import json

import paa.audioBasicIO as audioBasicIO
import paa.audioFeatureExtraction as aF
from thumbnailing import musicThumbnailing
from subprocess import call
from pydub import AudioSegment
from snippet import Snippet

def process(inputFile, resultLimit):
    if not os.path.isfile(inputFile):
        raise Exception("Input audio file not found!")

    # print("read audio")
    [Fs, x] = audioBasicIO.readAudioFile(inputFile)
    if Fs == -1:    # could not read file
        return
    matches = None
    if (len(np.shape(x)) > 1):
        # convert to mono, used for self-anal
        x = np.mean(x, axis=1)

    F = aF.stFeatureExtraction(x, Fs, 0.050 * Fs, 0.050 * Fs)
    bpm, _ = aF.beatExtraction(F, 0.050)
    bpm = max(bpm, 200)
    spb = 60/bpm # seconds per beat
    decreased_res = False
    # print("estimated BPM around", bpm)
    overlapSize = spb*2

    # print("finding rough overlaps")
    [matches, _] = musicThumbnailing(x, Fs, spb, spb, overlapSize)

    # print("finding details")
    for match in matches:
        if match.get_volume(x, Fs) < 1 or match.get_shift() < 0.001:
            match.invalidate()
            continue
        match.compute_length(x, Fs)

    matches = [m for m in matches if m.is_valid()]
    matches.sort(key=lambda entry: entry.A2)

    reduced = dict()
    for match in matches:
        key = str(round(match.length, 4))
        if key not in reduced:
            reduced[key] = []
        reduced[key].append(match)

    matches = []
    for key in reduced:
        at_length = reduced[key]
        if len(at_length) == 1:
            matches.append(at_length[0])
        else:
            max_match = at_length[0]
            last_A2 = max_match.A2
            for match in at_length[1:]:
                if abs(last_A2 - match.A2) < spb*8:
                    # part of the previous one, chained
                    if match.similarity > max_match.similarity:
                        # is better, so use this instead
                        max_match = match
                else:
                    # unrelated, add the thing from before
                    matches.append(max_match)
                    max_match = match
                last_A2 = match.A2
            if len(matches) == 0 or matches[-1] is not max_match:
                matches.append(max_match)

    matches.sort(key=lambda entry: entry.similarity, reverse=True)

    # print("got", len(matches), "possibilities")
    matches = matches[:resultLimit]

    # print("processing", len(matches), "results")
    results = []
    for match in matches:
        results.append(np.around([
            match.similarity, match.length, match.A2, match.B1
        ], decimals=3).tolist())

    return {
        "bpm": round(bpm, 3),
        "overlap": round(overlapSize, 3),
        "results": results,
        "lowres": decreased_res
    }

def crossfade(inputFile, outputFile, overlapSize, A2, B1, no_dip=False):
    good = False
    expected = len(AudioSegment.from_file(inputFile))/1000 - (B1 - A2)
    while not good:
        command = [
            "./bin/fade.sh", inputFile,
            outputFile,
            str(A2), str(B1),
            str(overlapSize),
            "squ" if no_dip else "dese"
        ]
        call(command)
        length = len(AudioSegment.from_file(outputFile))/1000
        good = abs(length - expected) < 2*overlapSize
        if not good:
            print("mismatch of expected size, rewriting... got", length, "but expected", expected)
    return outputFile

if __name__ == "__main__":
    inputFile = "src/audio.mp3"
    resultLimit = 200
    body = process(inputFile, resultLimit)

    # print(body)
    crossfade(inputFile, "test.mp3", body["overlap"], body["results"][0][2], body["results"][0][3])
