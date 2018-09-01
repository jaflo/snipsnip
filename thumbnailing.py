# modified from pyAudioAnalysis' audioSegmentation.py

import numpy as np
import scipy

import paa.audioFeatureExtraction as aF
import paa.audioTrainTest as aT
import paa.audioSegmentation as aS
import paa.audioBasicIO as audioBasicIO
from snippet import Snippet

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
