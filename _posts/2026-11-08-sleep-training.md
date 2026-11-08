---
title: "Sleep training Arche"
description: "We adapted Google Research’s SLEEP framework to Heura Arche and taught it two new jobs. It learned them better than a plain fine-tune, and its second run forgot less than its first. Not enough yet to ship."
author: Ryan
---

Heura Studios rests on one idea: a base model your team keeps teaching. That only works if the model can learn a new job without getting worse at the ones it already does, and usually it can't. Train a model on something new and it loses some of what it knew. Researchers call this catastrophic forgetting.

This fall we tried a training method modeled on sleep. We taught Heura Arche two new jobs with it, a case-competition coach and a data analyst, and compared it with a plain fine-tune on the same examples. Sleep training learned both jobs better: in its two runs, 94 and 88 more benchmark items right than the live model, against 73 for the plain fine-tune. The second run also forgot less than the first. Not enough yet, though: neither sleep version has shipped, and Arche 0.26 is still the live model.

## Background

Google Research’s [SLEEP framework](https://research.google/blog/the-sleep-framework-a-new-way-for-llms-to-retain-knowledge-in-continual-learning/) has a language model alternate between learning and an offline phase that consolidates what it learned, loosely the way the brain stabilizes memories during rest. In the paper, [Language Models Need Sleep: Learning to Self-Modify and Consolidate Memories](https://arxiv.org/abs/2606.03979) (Behrouz, Hashemi, Javanmard and Mirrokni), new low-rank experts take on new knowledge, the model’s knowledge is consolidated into them, and the model “dreams”: it rehearses on a curriculum it makes for itself, trained with reinforcement learning.

## Method

Heura Arche is our 2B model, built on Qwen3-VL-2B-Instruct and trained with LoRA adapters: small sets of weights trained on top of the base model. Our version keeps three ideas from the paper and fits them to one dense model and two GPUs.

![Diagram of sleep training drawn as a Heura Studios pipeline. Three inputs feed a new expert: job examples for case coaching and data analysis, trained as written (awake); Arche 0.26’s old skills in its own words, where its own answer that keeps every fact replaces the original (sleep: consolidation); and checked dreams, new practice questions answered by the best jobs model with its tools, kept only when right (sleep: dreaming). The new expert is a fresh LoRA adapter on top of Arche 0.26, which is merged into the base and frozen. The expert and Arche 0.26 are joined into one adapter: the next Arche.](/img/blog/sleep-training-how-it-works.png)

- **Expansion.** The live model, Arche 0.26, is merged into the base and frozen. The new jobs go into a new expert, a fresh LoRA adapter trained on top of it. Afterwards the two are joined into one adapter, and we check in full precision that the joined adapter computes what the two did together.
- **Consolidation.** Before training, Arche 0.26 answers the questions from its own training data. Wherever its answer keeps the facts (every number, the same final answer, the same JSON), the new expert trains on the model’s own words instead of the original example. Rehearsing what it already says pulls the model around less than rehearsing someone else’s wording.
- **Dreaming.** Our best jobs model answers new practice questions in each job with its tools, a calculator and a table query, three times each. A checker keeps only right answers: the right number or option first, and no number that can’t be traced to the question, the data or a tool. The new expert trains on those alongside the job examples.

We left out what needs more than one dense model and two GPUs: routing between experts, and the paper’s longer distillation and reinforcement-learning runs. Our dreaming is a single round of filtered self-training, with the checker as the reward. Each run, training and every benchmark included, took about 7 to 8 hours on two NVIDIA T4 GPUs.

## Results

We ran sleep training twice. Arche 0.31 was the first run. Arche 0.32 changed four things: it also rehearsed its business skills in its own words, trained the expert at half the learning rate, gave each dream more rounds of tool calls, and took its dreams from 0.31, on new questions. Arche 0.30 is the comparison: a plain fine-tune, one supervised pass over the same examples.

![Horizontal bar chart of the share of items right with the job’s brief. CASE-1, the case-competition coach, 60 tasks: Arche 0.26 (live) 9, the plain fine-tune 0.30 26, sleep run 0.31 35, sleep run 0.32 36. DATA-1, the data analyst, 80 questions: Arche 0.26 2, 0.30 58, 0.31 70, 0.32 63. Both sleep runs beat the plain fine-tune on both jobs.](/img/blog/sleep-training-jobs.png)

| Measure | Arche 0.26 (live) | 0.30, plain | 0.31, sleep | 0.32, sleep |
|---|---|---|---|---|
| CASE-1: case-competition coach (60 tasks) | 9 | 26 | 35 | 36 |
| DATA-1: data analyst (80 questions) | 2 | 58 | 70 | 63 |
| Business AI Benchmark v1 (20 tasks) | 91.7% | 90.4% | 88.3% | 88.3% |
| Business Extension v2 (20 tasks) | 60.8% | 69.2% | 59.2% | 65.8% |
| UNDERSTAND: messages as people really type them (83) | 66 | 62 | 61 | 63 |
| GEN-1: learn from one taught answer (68) | 43 | 40 | 41 | 44 |
| Picks the right tool (30 tasks) | 30 | 30 | 29 | 29 |
| Studio check, unseen company (10) | 9 | 8 | 9 | 9 |
| Lessons learned in the Studio (48) | 39 | 32 | 33 | 33 |

Each version was measured in its own run, next to Arche 0.26 measured again in that run; 0.26 gave the same numbers every time. The business scores are the mean of 3 runs. Lessons learned in the Studio counts the lessons with every figure right when the Studio’s training rounds stop, across 8 companies.

**Sleep training learned the jobs better.** Against the live model, the plain fine-tune got 73 more job items right, and the sleep runs 94 and 88. A fresh expert on a frozen model took the new skills better than training the existing adapter further. The second run gave back 6 of the first run’s gain, mostly on percent-change questions in the data job (8 of 10 right for 0.31, 4 for 0.32). The halved learning rate is the likeliest cause, but a run that changes four things can’t say which did what.

**The second run forgot less.** Against the first, it lost less on UNDERSTAND, GEN-1 and Business Extension v2, and GEN-1 is back level with the live model. With business rehearsed in its own words, Extension v2 rose to 65.8% (from 59.2%), but Business v1 stayed 3.3 points down in both sleep runs.

**Some forgetting remains.** Arche 0.26 learns lessons in the Studio better than any version that learned the jobs, sleep or not: 39 of 48, against 32 or 33. UNDERSTAND is down 3 to 5 in all three. What the three versions share is the job examples themselves, trained as written.

## Release status

We hold our own models to the rule the Studio’s Promotion gate holds yours to: a version that scores below the live one is held back. For Arche, a new version may not fall beyond noise on anything the live one already does. Arche 0.32 clears both job bars by a wide margin (it needed 24 of 60 and 30 of 80) and holds Extension v2, GEN-1, the tool check and the Studio check. It falls short on Business v1, UNDERSTAND and learning in the Studio, so Arche 0.26 stays live.

## Limitations

- One training run per version, and greedy decoding: differences of 1 or 2 items are within noise.
- CASE-1, DATA-1 and the Studio learning test are our own. No training example or dream names a benchmark’s company or asks one of its questions.
- Each sleep run changed several things at once, so the results say what each change set did, not which part did it.

## Next steps

1. Rehearse the job examples in the model’s own words too. They are the one thing all three jobs versions share, and the likeliest source of the forgetting they have in common.
2. Find out why learning in the Studio drops after a new job, and fix it before a jobs version ships.
3. Ship the first jobs version once it holds everything the live model does.
