---
title: 数学视角下的 AI
date: 2026-08-26
category: 数学
tags: [数学, 贝叶斯, Softmax, 推导]
description: 用贝叶斯分类器与 Softmax 看清模型背后的公式。
type: article
---

很多同学觉得 AI 背后全是黑箱，其实它的核心可以用清晰的数学语言描述。本文用两个经典例子说明。

## 贝叶斯最优分类器

给定特征 $x$，我们要把样本分到类别 $y$。贝叶斯决策告诉我们，选择使后验概率最大的类别：

$$ \hat{y} = \arg\max_{y} P(y \mid x) = \arg\max_{y} \frac{P(x \mid y)P(y)}{P(x)} $$

由于分母 $P(x)$ 与类别无关，等价于最大化 $P(x \mid y)P(y)$。这就是「生成式」思路的数学根基。

## 神经网络的输出层：Softmax

多分类时，我们常把最后一层接 Softmax，把实数向量映射成概率分布：

$$ \text{Softmax}(z)_i = \frac{e^{z_i}}{\sum_{j=1}^{K} e^{z_j}} $$

配合交叉熵损失：

$$ \mathcal{L} = -\sum_{i=1}^{K} y_i \log \hat{y}_i $$

其中 $y_i$ 是真实标签的 one-hot 编码，$\hat{y}_i$ 是模型预测概率。

## 梯度去哪了

训练就是最小化 $\mathcal{L}$。对参数 $\theta$ 做梯度下降：

$$ \theta_{t+1} = \theta_t - \eta \nabla_\theta \mathcal{L} $$

反向传播不过是链式法则把 $\nabla_\theta \mathcal{L}$ 高效地算出来而已。

## 小结

公式并不可怕。当你能用 $P(y\mid x)$ 和 Softmax 描述一个模型时，它就已经从「魔法」变成「方法」了。
