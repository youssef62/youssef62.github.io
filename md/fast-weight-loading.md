---
pagetitle: "Fast LLM weights loading from Lustre datastores"
---

<a href="/" class="home-button">🏠 Home</a>


<center>
<img src="assets/fast-weight-loading/epfl-ai-center-logo.png" alt="EPFL AI Center" style="height: 32px;">
&nbsp;&nbsp;&nbsp;
<img src="assets/fast-weight-loading/swiss-ai-logo.png" alt="Swiss AI Initiative" style="height: 32px;">
&nbsp;&nbsp;&nbsp;
<img src="assets/fast-weight-loading/easl-logo.png" alt="ETH EASL" style="height: 32px;">
</center>

*This work has been conducted as an internship at the EPFL AI Center and was supervised by [Xiaozhe Yao](https://about.yao.sh/), Systems Group, ETHZ.*



# Fast LLM weights loading from Lustre datastores



This summer, I had the opportunity to intern at the EPFL AI Center and work on improving the cold start time of LLMs on the [SwissAI serving platform](https://serving.swissai.svc.cscs.ch/): a research platform for serving LLMs on CSCS clusters on top of SLURM and [FirecREST](https://www.cscs.ch/services/products/firecrest) with the goal of enabling researchers to serve and use LLMs. One current limitation of the platform (and many inference engines in general) is that cold start times are long, which slows down research and wastes resources. 

In general, inference engines like vLLM or SGLang need to go through many steps before they can serve requests (for e.g., importign the dependencies, loading the model, capturing CUDA graphs, etc.). In the case of the SwissAI serving platform, we observed that most of the cold start time is spent loading weights from a [Lustre](https://www.lustre.org/) datastore to the GPU. 

In this post, I'll focus on **weight loading from Lustre datastores**. I'll show you how I was able to reduce the weight-loading time from **~827s to ~16s** (GLM4.7). The ideas are packaged in a small wrapper called <a href="https://github.com/eth-easl/servekit"><svg class="gh-icon" viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg> servekit</a>. 


## I. Time Breakdown

Let's first map the cold start steps to their wall-clock time to identify the bottlenecks. We can do this by parsing the logs printed by the SGLang server during the cold start phase. I added the log parser to `servekit` as a CLI command: `servekit profile`. 

For this experiment, we use `Llama-3.1-70B-Instruct` served with SGLang v0.5.10 (image `lmsysorg/sglang:v0.5.10`) with tensor-parallel size 4 on a single Bristen cluster node, with weights loaded with the default sglang model loader. SML keeps models in `capstor/store`, which is a [Lustre](https://www.lustre.org/) file system.  

<center><figure>
<img src="assets/fast-weight-loading/time_breakdown.png" alt="Stacked bar of cold start phase durations, dominated by weight_loading at 72% of the 629.79s total" width="85%">
</figure></center>

*These breakdowns are highly variable: they depend on `capstor` contention, per-node differences, and other factors. [This document](https://github.com/eth-easl/servekit/blob/main/experiments/lustre-loading-exp/results/phase_stats.md) compiles 3 runs of the baseline breakdown on different days with per-phase statistics (mean, stddev, min, max).*


As we can see, loading weights from persistent storage (`capstor/store`) is by far the most time-consuming step, with **72%** of the total cold start time. It is followed by CUDA graphs capture (`piecewise_cuda_graph_capture` + `cuda_graph_capture`) which is **17%**. The other steps account for around **11%** of the total cold start time and are mostly JIT compilation and Python package imports.

## II. Weight Loading

Weight loading is clearly the bottleneck. **453.74** seconds for a 70B (141 GB) model is a lot: that is only **0.29 GiB/s**. [Capstor's aggregate theoretical bandwidth](https://docs.cscs.ch/alps/storage/) (across all users and jobs) is a whopping **1.19 TB/s**, and we are connected to it with [4 HPE Cray Slingshot-11 NICs](https://docs.cscs.ch/alps/hardware/#alps-high-speed-network) with a combined bandwidth of **4 x 23.28 GiB/s**, so that NIC bandwidth should be our bottleneck. We should be able to do much better than **0.29 GiB/s**.

So let's try to understand:

*Why is the default weight loader so slow in our setup?*

### 1. The default weight loader and mmap

The default SGLang loader uses `mmap` to load the weight files. 

But what is `mmap`? (I wrote a longer explanation of how `mmap` works [here](mmap.html).) `mmap` is a system call that maps a virtual memory region to a file. That memory region will not be mapped to a physical memory region until it is accessed a first time. When a `mmap`ed page is accessed for the first time, the kernel will realize that the virtual page does not have a corresponding physical page but is `mmap`ed to a file. So it will load the corresponding page from disk to the page cache (RAM) and then associate the virtual page with the page cache page. This is called a **major page fault**. On subsequent access, the virtual page is already mapped to a physical page in the page cache and no disk access is needed. This is called a **minor page fault**. [^1]

Concretely, in our Llama example, the `DefaultModelLoader` calls methods like `multi_thread_safetensors_weights_iterator`, which return an iterator over pairs (`tensor_name`, `tensor_weights`) where `tensor_weights` is an `mmap`'ed tensor. This iterator is passed to `LlamaForCausalLM`, which passes each parameter (like `ColumnParallelLinear`) its tensor weights. The parameter will then get a view of its needed weights according to its rank (`tp_rank` in the case of `ColumnParallelLinear`) and will then initiate a host (CPU) to device (GPU) copy of the weights.

<center><figure>
<img src="assets/fast-weight-loading/weight-loading.png" alt="Weight loading: mmap to shard to GPU" width="50%">
</figure></center>

My hypothesis is that this triggers a **major page fault** for each page touched, which gets loaded from Lustre going through the network to the page cache and then copied to GPU. This would be a very slow process, especially for large models with many tensors spread over many pages. [^2]

To check this, we run the exact same experiment with SGLang's `--weight-loader-disable-mmap`, which skips `mmap` entirely. 

We get **45.7s** for weight loading, which is **9.9x faster** than the default loader and corresponds to **2.8GiB/s**. 

> **Lesson.** For weight loading using an HDD-backed Lustre file system, using `mmap` is a bad idea. The simple `--weight-loader-disable-mmap` flag is a huge improvement.


This still leaves another possible explanation: maybe it's not `mmap` itself but the many small host-to-device copies it causes. Let's try another one-flag method that does not use `mmap`: `fastsafetensors` [^6] (`--load-format fastsafetensors`) partitions files across TP ranks; each TP process reads a file with `pread` and then exchanges the weights with other TP ranks using NCCL communication. *Once all weights are on each GPU, tensors are parsed one by one directly in GPU memory*. This eliminates the need for small tensor copies from host to device. If the small copies were the real bottleneck, this should beat `--weight-loader-disable-mmap`.

We get **59.1s** for weight loading, which is **7.7x faster** than the default loader but worse than `--weight-loader-disable-mmap`. This confirms again that the bottleneck was `mmap` and not the small tensor copies from host to device.

This is a huge improvement and shows that `mmap` is not suitable for weight loading on Lustre file systems. However, **2.8GiB/s** is still far from the theoretical maximum of **4x23.28 GiB/s**. Let's see if we can do better.


### 2. Understanding the lustre data storage

Let's set SGLang aside for a moment and ask a simpler question:  

*Irrespective of SGLang, how fast can we load files from Lustre?*

**Across OST parallelism.** Lustre is a distributed file system that saves files across different *Object Storage Targets (OSTs)*. Each OST is a storage volume that can be accessed independently. To increase the read bandwidth, we need to distribute the model weights across multiple OSTs so we can benefit from parallelism across OSTs. In our case, we will have each `.safetensors` file in a different OST. For models like `Llama-3.1-70B-Instruct`, there are 30 `.safetensors` files. 


<center><figure>
<img src="assets/fast-weight-loading/lustre.png" alt="Lustre data storage" width="50%">
</figure></center>

However, single OSTs also benefit from having many requests in flight.

**Within OST parallelism.** Even within a single OST, we can increase the read bandwidth by having multiple processes reading from the same OST in parallel. This is because each process can issue its own I/O requests, and the OST can handle these requests concurrently.

*How many parallel readers does a single OST need to reach its full read bandwidth?*

To answer this, we will experiment with `dd iflag=direct`. This command lets us read files from disk without going through the page cache. We can use it as follows: `dd iflag=direct if=input.bin of=output.bin bs=16M`, where `bs=16M` is the block size, i.e. the amount of data read from disk in one request. In our experiment, we use `bs=16M` and read to `/dev/null` to measure the read speed. We study the effect of the number of parallel `dd` processes on the read speed. 

```bash
per=$(( 256 / nprocess ))           
t0=$(date +%s.%N)
for ((i=0;i<nprocess;i++)); do
  dd if="${SICK}" of=/dev/null bs=16M skip=$((i*per)) count=$per iflag=direct status=none &
done
```

We measure this on a single-striped 4.6 GB shard, reading a 4 GiB window of it (`bs=16M`, `O_DIRECT`, to `/dev/null`) while sweeping the number of parallel `dd` processes over disjoint, contiguous byte ranges of the same file. Each point is the median of 3 runs; bars span min to max:

<center><figure>
<img src="assets/fast-weight-loading/ost_queue_depth.png" alt="OST read throughput keeps scaling with the number of parallel readers" width="40%">
</figure></center>

Throughput scales close to linearly with reader count up to 8, then keeps climbing sublinearly: 64 readers reach **6.7 GB/s**, an **18x** speedup over a single reader, and the curve has still not flattened. With many processes, we are able to keep many RPCs in flight, improving the bandwidth. 

> **Lesson.** To maximize bandwidth on Lustre storage with `O_DIRECT` reads (no page cache), we need parallelism both across OSTs and within a single OST.

Equipped with this knowledge, we try the following:

* Load in parallel (60 processes per file, which is maybe too much) from Lustre to `/dev/shm` (RAM), and then use SGLang's default loader from `/dev/shm` to GPU. The staging takes `7s`, which is more than **18 GiB/s**, already much better than everything we have seen before. The weight loading takes `20s`, which is `> 6 GiB/s`. Overall, this is a **16x speedup** over the default loader.

<center><figure>
<img src="assets/fast-weight-loading/parallel-reads-lustre.png" alt="Parallel processes read file chunks from different OSTs on Lustre into /dev/shm, which SGLang then reads from" width="70%">
</figure></center>

* This idea is possible because each node in both our clusters (Bristen and Clariden) has more RAM than GPU RAM. This means a node's specific shard of weights can always be stored in RAM if we preshard the weights across nodes. This is what we do next. We use `--load-format sharded_state`, which lets us save our weights by their TP rank. One added benefit is that our weights are now contiguous for each rank, which speeds up our H2D reads (see below). 

* Additionally, we can overlap the staging with the SGLang server launch. This is possible because the first steps (`process_startup`, `tp_worker_spawn`, `torch_distributed_init`) do not need the weights. We can start staging to `/dev/shm` while the server is still in `process_startup`. This is what I report below as **/dev/shm staging + presharded + overlap**.

* Staging to `/dev/shm` is better than warming up the page cache for models that don't fit in a single node. For these, to warm all the weights a rank needs, we would need to fill the page cache with all weights of the model which don't fit in the RAM. 

* Staging to `/dev/shm` is different from using `--weight-loader-disable-mmap` in two ways. 
    1. Scaling: With `--weight-loader-disable-mmap`, each rank still reads the complete model weights: **although it discards most of it and keeps only its shard, it still reads all of it.** This means the total size of weights loaded increases **linearly** with the node count. In our method, it remains constant. 
    2. Implementation: the standard `--weight-loader-disable-mmap` has 8 threads by default, each running a `pread` on a file. If our files are big, this will overflow RAM. 


*Weight loading experiments (s), Bristen*

| config | weight_loading (s) | speedup | total cold start (s) |
|---|---|---|---|
| default loader | 453.7 | 1.0× | 629.8 |
| nommap | 45.7 | 9.9× | 214.7 |
| fastsafetensors  | 59.1 | 7.7× | 230.0 |
| /dev/shm staging + mmap | 20.1 + 7.7 (stage) | 16.3× | 194.7 |
| /dev/shm + TP-presharded | 8.8 + 7.4 (stage) | 28.0× | 170.8 |
| /dev/shm staging + presharded + overlap | 9.7 | 47.0× | 179.0 |



* To avoid corrupting our results with any kind of caching, we run the methods in **reverse order** of expected speed and on different nodes, meaning `/dev/shm + presharded + overlap` ran before the default loader experiment. 
* Similarly to the previous section, these results are highly variable, so we provide 3 runs of each experiment (conducted on different days) in [this document](https://github.com/eth-easl/servekit/blob/main/experiments/lustre-loading-exp/results/phase_stats.md) with statistics (mean, stddev, min, max).

Here's the current breakdown of the cold start of our best method, **/dev/shm staging + presharded + overlap**. The weight loading is not the bottleneck anymore, the cuda graph capture is. 

<center><figure>
<img src="assets/fast-weight-loading/overlap_breakdown.png" alt="Cold start phase breakdown for the /dev/shm staging + presharded + overlap arm, with the staging shown as a separate bar underneath that finishes while the engine is still in process_startup" width="85%">
</figure></center>



### 3. Fast weight loading with servekit

I packaged the above ideas into a small wrapper called `servekit` that can be used to launch SGLang servers with fast cold starts. It is not a new serving engine: it simply stages and launches SGLang with the optimizations described above. Currently, `servekit` implements fast weight loading and JIT kernel caching (the latter is outside the scope of this post). 

[`servekit`](https://github.com/eth-easl/servekit) has a main command, `servekit launch`, which takes a normal SGLang command as an argument and launches it with optimizations. 

```bash
servekit launch --servekit-artifact-path <dir> \
  -- python -m sglang.launch_server --model-path <model> --tensor-parallel-size 4 ...
```

`servekit` also offers several utilities, such as `servekit profile`, `servekit bench` and `servekit verify`, to profile a cold start, benchmark a running server, and verify that the server produces the same numbers as a trusted reference. You can find documentation for these commands in the [servekit README](https://github.com/eth-easl/servekit/blob/main/README.md).


**Comprehensive results**

We evaluate `servekit` against the default loader, `--weight-loader-disable-mmap` and `--load-format fastsafetensors` on multiple models. 

*Config*

| | Apertus-8B-Instruct-2509 | Llama-3.1-70B-Instruct | GLM-4.7 |
|---|---|---|---|
| size | 16 GB | 141 GB | 717 GB |
| parallelism | TP4 | TP4 | TP4-PP4 |

This sweep uses SGLang v0.5.16 (image `lmsysorg/sglang:v0.5.16`).

*Weight loading time (s) on Bristen*

| Loader | Apertus-8B-Instruct-2509 | Llama-3.1-70B-Instruct | GLM-4.7 |
|---|---|---|---|
| default loader (mmap) | 78.0 | 737.0 | 827.9 |
| `--weight-loader-disable-mmap` | 9.5 | 46.0 | 294.9 (num_threads=4) |
| `--load-format fastsafetensors` | 17.9 | 61.3 | 143.8 |
| servekit (shm, no overlap) | 3.3 + 2.0 | 9.3 + 14.2 | 10.6 + 16.4 |
| **servekit (shm, overlap)** | **2.1** | **14.3** | **16.2** |


*Weight loading time (s) on Clariden*

| Loader | Apertus-8B-Instruct-2509 | Llama-3.1-70B-Instruct | GLM-4.7 |
|---|---|---|---|
| default loader (mmap) | 92.8 | 794.2 | 861.6 |
| `--weight-loader-disable-mmap` | 4.5 | 27.8 (num_threads=4) | 263.7 (num_threads=2) |
| `--load-format fastsafetensors` | 11.9 | 48.6 | 113.8 |
| servekit (shm, no overlap) | 1.1 + 0.9 | 5.1 + 6.0 | 40.8 + 6.5 |
| **servekit (shm, overlap)** | **0.9** | **6.0** | **6.7** |


 
* `--weight-loader-disable-mmap` OOMs on GLM-4.7, so we had to reduce the number of threads to 4 on Bristen and 2 on Clariden. Similarly, it OOMs on Llama-3.1-70B-Instruct on Clariden, so we had to reduce the number of threads to 4. 
* `fastsafetensors` does not work for multi-node currently; the reported result for GLM-4.7 is a patched version. 

> **Lesson.** The one-flag loaders read the full model on every rank, so load time grows with node count. `servekit` stages only each node's shard, so it stays roughly constant: GLM-4.7 (717 GB) loads about as fast as Llama-70B (141 GB), ~16s vs. ~14s.

**servekit's limitations**

- **On Correctness**: We rely on `ShardedStateLoader`, the loader behind `--load-format sharded_state`, which we discovered contained some bugs. To spot bugs, we use `servekit verify --url <ip> -record gold.json` to record the gold logprobs of a model served with the default loader, and then use `servekit verify --url <ip> -compare gold.json` to compare the logprobs of the same model served with `servekit`. This is a very strict test that checks that the logprobs are equal up to `1e-6`. All models above pass this test. However, some models currently don't, because of bugs in `ShardedStateLoader` (e.g. `gpt-oss-20b`). It is therefore important, when using `servekit`, to first check that your model is supported with `servekit verify`. See [this sbatch script](https://github.com/eth-easl/servekit/blob/main/tests/e2e/scripts/glm51-fp8-multinode-pp.sbatch) for an example of how we use `servekit verify` to check a model (GLM-5.1-FP8, multinode, TP4/PP4/EP4) against a baseline before trusting the presharded loader for it. 

  Here are the bugs I discovered that I raised to the SGLang team: 
    - [mxfp4 + sharded_state load format silently drops expert weights (gpt-oss-20b)](https://github.com/sgl-project/sglang/issues/34448) (#34448)
      - Relevant for Kimi-K3
    - [`sharded_state` cannot save and load an MLA model](https://github.com/sgl-project/sglang/issues/35702) (#35702)
      - Relevant for GLM-5.x models. 
      - `servekit` now patches sglang to fix this issue, but it is not a permanent solution.

  The following PRs fix the aboves issues respectively: 
    - [Manually register kv_b_proj to attn_mha so mla model work with ShardedModelLoader](https://github.com/sgl-project/sglang/pull/35715) (#35715)
    - [Preserve MXFP4 Triton weights in sharded state](https://github.com/sgl-project/sglang/pull/34558) (#34558)

- **On ergonomics**: Presharding the models implies a separate prepare step; `servekit` tries to simplify this by doing it automatically on the first run, so users don't need to worry about it. When running `servekit launch --servekit-artifact-path <path> python -m sglang.launch_server ...`, a presharded copy of the model is created in `<path>`. This causes a first run to be slower than the default loader. 

**servekit vs. the other loaders**

| Method | Pros ✅| Cons ❌|
|---|---|---|
| default loader (mmap) |  | Really slow on Lustre |
| `--weight-loader-disable-mmap` | One flag, 2.8x to 16x faster than default | - OOMs on large models (GLM-4.7), needed `num_threads=4` to fit<br>- Loads all weights per rank so scales badly with model size<br>- Needs a full node: 3.9x slower at 32 CPUs than at 128 |
| `--load-format fastsafetensors` | - One flag, significant speedups | - Doesn't work for multi-node yet; GLM-4.7 result needed a patched version<br>- Scales badly with node count due to costly NCCL through Slingshot |
| servekit | - Fastest across all models<br>- If model size scales linearly with node count, weight size loaded per node is constant and so is time (see Llama vs. GLM-4.7, 14s vs. 16s) | - Slower first run<br>- Relies on `ShardedStateLoader`, a correctness check is needed |

## Final Thoughts

I learnt a lot in this project! I hope this post will be of help to you if you are facing slow weight loading times. If you use HDD backed Lustre storage for you weights and you want to try [`servekit`](https://github.com/eth-easl/servekit), do not hesitate to reach out to me at my email: "name dot family name at gmail dot com". I will be happy to help you get started with it. 

[^1]: A threadpool of size 8 is used to do mmap in parallel. 

[^2]: Actually, when a page fault happens a certain number X of pages is loaded at once for efficiency, thanks to readahead. This X is set by the Lustre client. However, even with this in mind, the general intuition that this causes many small network round trips remains.

[^6]: [Speeding up Model Loading with fastsafetensors](https://arxiv.org/abs/2505.23072) ([GitHub](https://github.com/foundation-model-stack/fastsafetensors))


