#!/usr/bin/env python3
import os
import numpy as np
import math
import sys
import time
import json

import paa.audioFeatureExtraction as aF
import paa.audioTrainTest as aT
import paa.audioSegmentation as aS
import paa.audioBasicIO as audioBasicIO
import scipy
from subprocess import call
from pydub import AudioSegment

class Snippet():
    def __init__(self, similarity, A1, A2, B1, B2):
        self.similarity = similarity
        self.A1 = A1
        self.A2 = A2
        self.B1 = B1
        self.B2 = B2

    def __str__(self):
        return 'Snippet {:7.2f} --> {:<7.2f} ({:.2f} long, {:.5f} similar)'.format(
            self.A1, self.B1, self.length, self.similarity)

    def compute_length(self, x, Fs):
        self.length = (len(x) / Fs) - (self.B1 - self.A1)

    def get_volume(self, x, Fs):
        a = x[int(Fs * self.A1):int(Fs * self.A2)]
        return np.absolute(a).mean()

    def get_shift(self):
        return abs(self.A1 - self.B1)

    def invalidate(self):
        self.similarity = -1

    def is_valid(self):
        return self.similarity > -1

def extractFeatures(x, Fs, shortTermSize, shortTermStep):
    x = audioBasicIO.stereo2mono(x)
    featureVectors = aF.stFeatureExtraction(x, Fs, Fs*shortTermSize, Fs*shortTermStep)
    [featureVectors2, _, _] = aT.normalizeFeatures([featureVectors.T])
    featureVectors2 = featureVectors2[0].T
    return featureVectors2.T

def musicThumbnailing(x, Fs, shortTermSize=1.0, shortTermStep=0.5, thumbnailSize=10.0, Limit1 = 0, Limit2 = 1):
    # self-similarity matrix
    x = audioBasicIO.stereo2mono(x)
    stFeatures = aF.stFeatureExtraction(x, Fs, Fs*shortTermSize, Fs*shortTermStep)
    S = aS.selfSimilarityMatrix(stFeatures)

    # moving filter:
    M = int(round(thumbnailSize / shortTermStep))
    B = np.eye(M,M)
    S = scipy.signal.convolve2d(S, B, 'valid')

    MIN = np.min(S)
    # post-processing (remove main diagonal elements)
    for i in range(S.shape[0]):
        for j in range(S.shape[1]):
            if abs(i-j) < 5.0 / shortTermStep or i > j:
                S[i,j] = MIN

    # find max position:
    S[0:int(Limit1*S.shape[0]), :] = MIN
    S[:, 0:int(Limit1*S.shape[0])] = MIN
    S[int(Limit2*S.shape[0])::, :] = MIN
    S[:, int(Limit2*S.shape[0])::] = MIN

    matches = []
    maxMax = maxVal = np.max(S)
    i1 = i2 = j1 = j2 = 0
    Sbak = np.copy(S)

    while maxVal > maxMax/3*2 > MIN: # currently arbitrary cutoff
        [I, J] = np.unravel_index(S.argmax(), S.shape)

        # expand:
        i1 = I; i2 = I
        j1 = J; j2 = J

        while i2-i1<M:
            if i1 <=0 or j1<=0 or i2>=S.shape[0]-2 or j2>=S.shape[1]-2:
                break
            if S[i1-1, j1-1] > S[i2+1,j2+1]:
                i1 -= 1
                j1 -= 1
            else:
                i2 += 1
                j2 += 1
            S[i1, j1] = S[i2, j2] = MIN

        # only add to potential matches if we have enough overlap or new record
        if i2-i1 >= M:
            matches.append(Snippet(
                maxVal,
                shortTermStep*i1, shortTermStep*i2,
                shortTermStep*j1, shortTermStep*j2
            ))

        S[I, J] = MIN
        maxVal = np.max(S)

    return (matches, Sbak)

def main():
    inputFile = "src/audio.mp3"
    resultLimit = 200
    body = process(inputFile, resultLimit)

    # print(body)
    crossfade(inputFile, "test.mp3", body["overlap"], body["results"][0][2], body["results"][0][3])

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
    main()
