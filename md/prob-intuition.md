# Intuition behind some probability concepts

These are some intuitions that I have either read or developed over the years. Most of them are accessible after an introductory course in probability.  

## Markov's inequality

I did not come up with this intuition myself, I picked it up from Prof. Kapralov's lectures on algorithms. Although it's so fundamental that it's likely to be found in other places.

Suppose we have a population in which *the average salary* is 6000\$. We want to know the maximal proportion of the population can earn at least 8000\$. Let's start simple. 

Can everyone earn at least 8000\$? No, because the average would be *higher* than 6000\$. 

Can half the population earn at least 8000\$? Yes, if half the population earns 8000\$ and the other half earns 4000\$, the average would be 6000\$. 

So we know the answer lies between 50% and 100%. 

Now, let's consider 75%. If 75% of the population earns 8000\$, and the rest earns 0\$. The average would be 6000\$. 

Can we do better? No, because if we increase the proportion of people earning 8000\$, the average would increase, as we are already giving the least amount possible to the rest of the population.

What's so special about 75%? It's the ratio : 6000/8000 = average / k. Where k is the amount that we are interested in. So we established that: 
$$ \color{red}{\text{proportion earning at least 8000\$}} \color{black}\leq \frac{\color{blue}{\text{average salary}}}{\color{green}{8000\$}}$$

Now, if we think of the salaries as a non-negative random variable $X$, of the average salary as $\mathbb{E}(X)$, and the amount we are interested in as $k$, we get the Markov inequality:
<!-- color corresponding quantites above -->

$$ \color{red}{\mathbb{P}(X \geq k)} \color{black}\leq \frac{\color{blue}{\mathbb{E}(X)}}{\color{green}{k}}$$ 


## How you might arrive at the weak law of large numbers 

Consider the following two scenarios: 

**Scenario 1**: You toss a coin and record the outcome. <br>
**Scenario 2**: You toss a coin 100 times and record the **average** of the outcomes. 

Suppose now you repeat the above scenarios multiple times. *In which one of the two scenarios do you expect the outcome to have more variance across the different repetitions?*

You likely answered **Scenario 1**. This is intuitive and also correct although it's not immediately obvious why.  
Let's formalize this intuition. Let $X_1$, $X_2$, ..., $X_n$ be independent and identically distributed random variables.  

**Scenario 1**: Record the outcome of $X_1$.  <br>
**Scenario 2**: Record the average $\bar X := \frac{1}{n} \sum_{i=1}^{n} X_i$.

We have that :  
$$\operatorname{var}(\bar X) = \frac{1}{n} \operatorname{var}(X_1)$$

This not only confirms our intuition that variance(Scenario 2) < variance(Scenario 1)  but also quantifies the rate of decay as a function of the number of repetitions $n$.

<br>
Now, we know that as $n$ increases, the variance of the mean decreases. One natural question to ask is: *What does the mean converge to ?*  
One way to get an idea of the answer is to look at the definition of the variance of the mean:

$$\operatorname{var}(\bar X) = \mathbb{E} \left[ \Bigg| \bar X - \mathbb{E}(X_1) \Bigg|^2 \right]$$

We can (handwavingly) see that as $n$ increases, the variance will converge to $0$ and so $\bar X = \frac{1}{n} \sum_{i=1}^{n} X_i$ will get closer to $\mathbb{E}(X_1)$.  

To answer the question more rigorously, we can use Chebyshev's inequality, which says that for any random variable $Y$ with finite variance, we have :  
$$\mathbb{P} \Bigg( \Bigg| Y - \mathbb{E}(Y) \Bigg| > \epsilon \Bigg) \leq \frac{\operatorname{var}(Y)}{\epsilon^2}$$

Let's apply it with $Y= \bar X$ :  
$$\mathbb{P}\left( \Bigg|\bar X - \mathbb{E}(X_1)\Bigg| > \epsilon \right) \leq \frac{\operatorname{var}(\bar X)}{\epsilon^2} = \frac{\operatorname{var}(X_1)}{n \epsilon^2} \to 0$$ as $n \to \infty$, for any $\epsilon > 0$.  

This result is known as the weak law of large numbers. The empirical average converges in probability to the expected value. This justifies why we think of the expected value as the "true" average of the random variable.

**Why should you care ?** 
The above result is really intuitive. After all we just showed that the *empirical* average converges to the *theoretical* average. What does that mean in practice ? 
One application of this fact, is boosting *estimators*. Suppose we want to approximate an unknown quantity $\theta$. Let's also suppose that we have constructed an unbiased estimator $X$ with a large variance. Unbiased meaning that $\mathbb{E}(X) = \theta$. 

Our above result tells us that by average multiple independent copies of $X$, we get can estimator $\bar X = \frac{1}{n} \sum_{i=1}^{n} X_i$ with the same accuracy (still unbiased) but with a smaller variance. 


## The difference between different types of convergence 

### Convergence in distribution vs Convergence in probability 

Let's first start with definitions of the two types of convergence:

* **Convergence in distribution**: A sequence of random variables $X_n$ converges in distribution to a random variable $X$ if 
$$\mathbb{P}(X_n \leq t) \to \mathbb{P}(X \leq t)$$ for all $t$ at which $X$ is continuous.
* **Convergence in probability**: A sequence of random variables $X_n$ converges in probability to a random variable $X$ if : 
$$\forall \epsilon > 0 \quad \mathbb{P}(|X_n - X| > \epsilon) \to 0 \text{ as } n \to \infty$$.

You probably saw in your probability course that convergence in probability implies convergence in distribution.
What's interesting in the other way. Does convergence in distribution imply convergence in probability ?

This question is in reality a pretext to go back to the basics of what's a random variable and how it relates to it's distribution. 

For that, let's consider these two simple examples, suppose our set of outcomes is $\Omega = \lbrace 0,1\rbrace$ (ie a coin flip) and let $P(\lbrace 0\rbrace) = 0.5$ and $P(\lbrace 1\rbrace) = 0.5$. 

A random variable here would be a function[^1] from $\Omega$ to $\mathbb{R}$. Let's consider the following two examples: 

* **Example 1**: Let $X$ and $Y$ such that $X(0) = 0$ and $X(1) = 1$ and $Y(0) = 0$ and $Y(1) = 1$.
These two random variables are equal, so they have the same distribution.
<center><img src="../assets/cdf.svg" alt="alt text" style="width: 60%;"></center>

* **Example 2**: Let $X$ and $Y$ such that $X(0) = 0$ and $X(1) = 1$ and $Y(0) = 1$ and $Y(1) = 0$.
In this case, $Y=1-X$. However, they have the same distribution (and thus the same CDF, the one above). 

In both, situations, the two random variables have the same distribution which is bernoulli(0.5). However, in the second example, the two random variables are not equal. This tells us that when we know the distribtuion of a random variable, we actually don't know much about the random variable itself. 

Now if we look at the definition of convergence in distribution, it's clearly a statement only about the distribution of the random variables. However, convergence in probability is a statement that is much more about the random variables themselves. In fact, it's about the distance $|X_n - X|$. 

Moreover, the random variales of the second example, $X$ that follows a bernoulli(0.5) distribution and $Y = 1-X$ which also follows a bernoulli(0.5) distribution, are a counter-example to the question we asked. 
If we set $\hat X_n = X$ and $\hat X = Y$, then we have that $\hat X_n$ converges in distribution to $\bar X$, in fact they have the same distribtuion (bernoulli(0.5)). But $|\hat X_n - \hat X| = 1$ for all $n$ so there is no convergence in probability. 


[^1]: A function *measurable* with respect to a sigma-field of $\Omega$, but that's not the point here. 