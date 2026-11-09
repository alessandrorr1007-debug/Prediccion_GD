"""CNN pequeña opcional. PyTorch solo es necesario al usar este candidato."""
import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin


class CNNFER(ClassifierMixin, BaseEstimator):
    def __init__(self, epochs=8, seed=42):
        self.epochs = epochs
        self.seed = seed

    def fit(self, X, y):
        import torch
        from torch import nn

        torch.set_num_threads(2)
        torch.manual_seed(self.seed)
        azar = torch.Generator().manual_seed(self.seed)
        self.classes_, etiquetas = np.unique(y, return_inverse=True)
        self.n_features_in_ = X.shape[1]
        self.red_ = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.AdaptiveAvgPool2d((4, 4)), nn.Flatten(), nn.Linear(512, len(self.classes_)),
        )
        optimizador = torch.optim.Adam(self.red_.parameters(), lr=.001)
        perdida = nn.CrossEntropyLoss()
        for _ in range(self.epochs):
            for indices in torch.randperm(len(X), generator=azar).split(128):
                lote = torch.as_tensor(X[indices.numpy()], dtype=torch.float32).reshape(-1, 1, 48, 48) / 255
                voltear = torch.rand(len(indices), generator=azar).reshape(-1, 1, 1, 1) < .5
                lote = torch.where(voltear, lote.flip(-1), lote)
                optimizador.zero_grad()
                perdida(self.red_(lote), torch.as_tensor(etiquetas[indices.numpy()])).backward()
                optimizador.step()
        self.red_.eval()
        return self

    def predict_proba(self, X):
        import torch

        resultados = []
        with torch.no_grad():
            for desde in range(0, len(X), 128):
                lote = torch.as_tensor(X[desde:desde + 128], dtype=torch.float32).reshape(-1, 1, 48, 48) / 255
                resultados.append(self.red_(lote).softmax(dim=1).numpy())
        return np.concatenate(resultados)

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(axis=1)]
