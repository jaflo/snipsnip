import numpy as np

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
