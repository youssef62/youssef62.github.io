*I am currently working on loading language models in a fast way. In this context, I have been encountering the `mmap` system call a lot. In this blog, I document how I went to understand `mmap` in an experimental way.*

---
pagetitle: "What is mmap?"
---

# What is `mmap`?

<a href="/" class="home-button">🏠 Home</a>



<!-- * why can mmap be shared ?
* what are the most important applications of mmap ?
* why is mmap at the end of the heap ?
* the mmap region and the difference with the heap.  -->


We will ask this question to the man page of `mmap` using the command `man mmap`: 
```c
#include <sys/mman.h>
void *mmap(
    void *addr, 
    size_t len, 
    int prot, 
    int flags, 
    int fd, 
    off_t offset
);
```

> The mmap() [system call](https://en.wikipedia.org/wiki/System_call) causes the pages starting at **addr** and continuing for at most **len** bytes to be mapped from the object described by **fd**, starting at byte offset **offset**.

First, we can deduce that `mmap` stands for "memory mapping". One immediate benefit we can see is that `mmap` could be used to read from a file in the same way we read memory i.e by going through virtual addresses[^virtual-memory]. 

Let's also look at somes values that `flags` can take:

* `MAP_ANON` Map anonymous memory not associated with any specific file.  The offset argument is ignored.  

* `MAP_FILE` Mapped from a regular file.  (This is the default mapping type, and need not be specified.)

`MAP_ANON` essentialy is what enables using `mmap` to map to main memory.

## How does the mapping happen?

In `mmap`, the mapping happens in two steps: 

1. First, a virtual memory region is reserved for the process[^process]. 
2. Then, when the process first accesses this virtual memory region, a mapping to a physical page[^page] is created.

**1. Reserving a virtual memory region.**
Let's understand the first point. A process holds a list of virtual memory regions. Each virtual memory region is described by a `struct vm_area_struct` in the kernel[^kernel]. *Reserving a virtual memory region* means that the kernel will create a new `struct vm_area_struct` and add it to the list of virtual memory regions of the process. Let's see this in practice.

We will use `mmap` with `addr` set to `NULL`, which means that the kernel will choose the address for us. We will also use `MAP_ANONYMOUS` to indicate that we want to map a portion of main memory, not a file. `fd` will be set to `-1` and `offset` to `0`, since we are not mapping a file. We will then print the contents of `/proc/self/maps` which are the process's virtual memory addresses. We will do this before and after the `mmap` call to see the difference.


```c
#include <sys/mman.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static void dump_maps(const char *label) {
    printf("\n--- /proc/self/maps (%s) ---\n", label);
    FILE *f = fopen("/proc/self/maps", "r");
    if (!f) { perror("fopen /proc/self/maps"); return; }
    char line[512];
    while (fgets(line, sizeof(line), f)) {
        fputs(line, stdout);
    }
    fclose(f);
    fflush(stdout);
}

int main(void) {
    dump_maps("before mmap");

    void *addr = mmap(NULL, 4096,
                      PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS,
                      -1, 0);
    if (addr == MAP_FAILED) { perror("mmap"); return 1; }

    printf("\nMapped address: %p\n", addr);

    dump_maps("after mmap");
    return 0;
}
```

*Source: [mmap_basics.c](https://github.com/youssef62/mmap_experiments/blob/master/experiments/mmap_basics/mmap_basics.c)*

Output(better looked at on a laptop):

```
--- /proc/self/maps (before mmap) ---
00400000-00401000 r-xp 00000000 00:2e 8                                  /w/mmap_basics
0041f000-00420000 r--p 0000f000 00:2e 8                                  /w/mmap_basics
00420000-00421000 rw-p 00010000 00:2e 8                                  /w/mmap_basics
2a0b5000-2a0d6000 rw-p 00000000 00:00 0                                  [heap]
ffffb7700000-ffffb789c000 r-xp 00000000 00:3f 180862                     /usr/lib/aarch64-linux-gnu/libc.so.6
ffffb789c000-ffffb78ad000 ---p 0019c000 00:3f 180862                     /usr/lib/aarch64-linux-gnu/libc.so.6
ffffb78ad000-ffffb78b0000 r--p 0019d000 00:3f 180862                     /usr/lib/aarch64-linux-gnu/libc.so.6
ffffb78b0000-ffffb78b2000 rw-p 001a0000 00:3f 180862                     /usr/lib/aarch64-linux-gnu/libc.so.6
ffffb78b2000-ffffb78bf000 rw-p 00000000 00:00 0 
ffffb78c1000-ffffb78e9000 r-xp 00000000 00:3f 180842                     /usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1
ffffb78f1000-ffffb78f3000 rw-p 00000000 00:00 0 
ffffb78fa000-ffffb78fc000 rw-p 00000000 00:00 0 
ffffb78fc000-ffffb78fe000 r--p 00000000 00:00 0                          [vvar]
ffffb78fe000-ffffb78ff000 r-xp 00000000 00:00 0                          [vdso]
ffffb78ff000-ffffb7901000 r--p 0002e000 00:3f 180842                     /usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1
ffffb7901000-ffffb7902000 rw-p 00030000 00:3f 180842                     /usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1
ffffb7902000-ffffb7903000 rw-p 00000000 00:00 0 
ffffca2b8000-ffffca2d9000 rw-p 00000000 00:00 0                          [stack]

Mapped address: 0xffffb78f9000

--- /proc/self/maps (after mmap) ---
00400000-00401000 r-xp 00000000 00:2e 8                                  /w/mmap_basics
0041f000-00420000 r--p 0000f000 00:2e 8                                  /w/mmap_basics
00420000-00421000 rw-p 00010000 00:2e 8                                  /w/mmap_basics
2a0b5000-2a0d6000 rw-p 00000000 00:00 0                                  [heap]
ffffb7700000-ffffb789c000 r-xp 00000000 00:3f 180862                     /usr/lib/aarch64-linux-gnu/libc.so.6
ffffb789c000-ffffb78ad000 ---p 0019c000 00:3f 180862                     /usr/lib/aarch64-linux-gnu/libc.so.6
ffffb78ad000-ffffb78b0000 r--p 0019d000 00:3f 180862                     /usr/lib/aarch64-linux-gnu/libc.so.6
ffffb78b0000-ffffb78b2000 rw-p 001a0000 00:3f 180862                     /usr/lib/aarch64-linux-gnu/libc.so.6
ffffb78b2000-ffffb78bf000 rw-p 00000000 00:00 0 
ffffb78c1000-ffffb78e9000 r-xp 00000000 00:3f 180842                     /usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1
ffffb78f1000-ffffb78f3000 rw-p 00000000 00:00 0 
ffffb78f9000-ffffb78fc000 rw-p 00000000 00:00 0 
ffffb78fc000-ffffb78fe000 r--p 00000000 00:00 0                          [vvar]
ffffb78fe000-ffffb78ff000 r-xp 00000000 00:00 0                          [vdso]
ffffb78ff000-ffffb7901000 r--p 0002e000 00:3f 180842                     /usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1
ffffb7901000-ffffb7902000 rw-p 00030000 00:3f 180842                     /usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1
ffffb7902000-ffffb7903000 rw-p 00000000 00:00 0 
ffffca2b8000-ffffca2d9000 rw-p 00000000 00:00 0                          [stack]
```

First, we can get a sense of what kind of information the kernel keeps of the processes' memory regions. We can see that our program `mmap_basics` has is stored in the virtual memory region `00400000-00421000`. The heap is stored in the virtual memory region `2a0b5000-2a0d6000`. The stack is stored in the virtual memory region `ffffca2b8000-ffffca2d9000`. 

Answering our question: We can see that  `mmap` gives us an address `0xffffb78f9000` and when we look at the `/proc/self/maps` output, we can see that this address range is present in the process's virtual address space `ffffb78f9000-ffffb78fc000 rw-p 00000000 00:00`. 

*Conclusion: `mmap` reserves a virtual memory region for the process by adding a new `struct vm_area_struct` to the list of virtual memory regions of the process.*

**2. Lazy memory mmaping.** One really important thing to note is that the mmaping to a physical page happens **lazily**. That is until the process actually accesses the memory at that address, the kernel will not allocate a physical page for it. Let's see this in practice.

To show this, we can watch two fields from `/proc/self/status`:

- `VmSize`: total **virtual** address space of the process.
- `VmRSS`: resident set size, i.e. the **physical** memory currently backing the process.

The plan is:

1. `mmap` a large anonymous region (256 MiB).
2. Print `VmSize` and `VmRSS`.
3. Touch one byte in every page of the region — this forces the kernel to fault a physical page in for each touched page.
4. Print `VmSize` and `VmRSS` again.

The full program is in [lazy_alloc.c](https://github.com/youssef62/mmap_experiments/blob/master/experiments/lazy_alloc/lazy_alloc.c). The interesting part is:

```c
const size_t N = (size_t)256 * 1024 * 1024;  // 256 MiB

print_status("before mmap");

char *p = mmap(NULL, N, PROT_READ | PROT_WRITE,
               MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);

print_status("after mmap, before touch");

for (size_t i = 0; i < N; i += 4096) {
    p[i] = 1;   // touch every page
}

print_status("after touching every page");
```

Running it:

```
[before mmap]
VmSize:     2136 kB   (virtual memory for this process)
VmRSS:       692 kB   (physical memory for this process)

mmap'd 256 MiB at 0xffff85a00000

[after mmap, before touch]
VmSize:   264412 kB   (virtual memory for this process)
VmRSS:     1108 kB   (physical memory for this process)

[after touching every page]
VmSize:   264412 kB   (virtual memory for this process)
VmRSS:   263344 kB   (physical memory for this process)
```

Reading this:

- After `mmap`, `VmSize` jumps by ~256 MiB immediately — the kernel reserved 256 MiB of **virtual** address space. But `VmRSS` barely moves, because no physical pages have been allocated yet. The mapping exists only as bookkeeping in the kernel's VMA table.
- After we touch every page, `VmRSS` jumps by ~256 MiB. Each write triggered a page fault[^page-fault]; the kernel handled it by allocating a physical page and mapping it into the process's page table[^page-table]. Only now does the mapping consume actual RAM.

This is why on Linux you can `mmap` an amount of memory that is much larger than the system's physical RAM: as long as you never touch most of it, it costs nothing in physical memory. This is what `malloc` uses when it needs to allocate a large chunk of memory: it `mmap`s it, and only when the program actually uses it does the kernel allocate physical pages. 

*Conclusion: `mmap` reserves a virtual memory region for the process, but the mapping to physical pages happens lazily, only when the process accesses the memory.*

## When and why malloc does use mmap ?

We mentioned earlier that `malloc` uses `mmap` under the hood for large allocations. Let's see how this works in practice. We can watch this happen with `strace`. Our program does one small `malloc(1 KiB)`, one large `malloc(1 MiB)`, and then frees both, printing markers to stderr between each step so they interleave with the syscall trace:
```c
mark("small malloc (1 KiB)"); // just for printing
void *small = malloc(1024);

mark("large malloc (1 MiB)");
void *large = malloc(1024 * 1024);

mark("free small");
free(small);

mark("free large");
free(large);

mark("done");
```

*Source: [malloc_strace.c](https://github.com/youssef62/mmap_experiments/blob/master/experiments/malloc_strace/malloc_strace.c)*

Let's run it under `strace` to see what syscalls are made:
```sh
strace -e trace=brk,mmap,munmap ./malloc_strace
```

The relevant tail of the output:

```
--- small malloc (1 KiB) ---
brk(NULL)              = 0x18281000        # query current program break
brk(0x182a2000)        = 0x182a2000        # grow heap by 132 KiB
--- large malloc (1 MiB) ---
mmap(NULL, 1052672, PROT_READ|PROT_WRITE,
     MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0xffffb6b4f000
--- free small ---
                                            # no syscall
--- free large ---
munmap(0xffffb6b4f000, 1052672) = 0
```

*Full trace: [malloc_strace.out](https://github.com/youssef62/mmap_experiments/blob/master/experiments/malloc_strace/malloc_strace.out)*

A few things to notice:

- The small `malloc` triggered `brk`, not `mmap`. glibc grew the heap by 132 KiB (much more than the 1 KiB requested) so future small allocations can be served without another syscall.
- The large `malloc` used `mmap` for a fresh anonymous region. The requested size is `1 MiB + 4 KiB` because glibc reserves one extra page for its chunk header.

**Why the split?** It comes down to the fact that the heap is a **single contiguous region** whose size is controlled by one number: the program break. `brk` can only move that break up or down, so the only memory you can ever return to the kernel from the heap is the memory at the very top of it. Anything trapped underneath a still-live allocation is stuck.

Imagine allocating a 100 MiB buffer *inside* the heap and then freeing it while a tiny 8-byte allocation sits above it:

```
     heap grows this way ─────────►
   ┌──────────────┬────────────────────────┬──────┬───────┐
   │ small allocs │  100 MiB (freed)       │ 8 B  │ ...   │  program break ─►
   └──────────────┴────────────────────────┴──────┴───────┘
                            ▲
                            └── cannot be returned to the OS:
                                the 8 B chunk above it pins the break.
```

Even though the 100 MiB is unused, glibc cannot call `brk` to shrink the heap because that would also invalidate the 8-byte chunk sitting above it. The freed memory just stays in a free list, wasting RSS. `mmap` regions don't have this problem, each one is an **independent** VMA: So by routing large allocations through `mmap`, glibc guarantees that a single big `free()` actually gives the memory back to the kernel. 

*Conclusion: `malloc` uses `mmap` for large allocations because it allows the kernel to reclaim memory immediately when the allocation is freed, whereas small allocations are served from the heap and cannot be returned to the kernel until the program break is moved down.*

## What happen when we use mmap to access a file?

First, let's see first what happens when we use `read()` to access a file. We will use `strace` to trace the system calls made by our program. We will then compare the system calls made when we use `mmap` to access a file.

Here's the code we will use to access a file using `read()` and `mmap()`:

```c
#define FILE_SIZE (16 * 16384)

int main(int argc, char *argv[]) {
    if (argc != 3) {
        fprintf(stderr, "usage: %s <read|mmap> <file>\n", argv[0]);
        return 1;
    }

    int fd = open(argv[2], O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }

    long pgsz = sysconf(_SC_PAGESIZE);

    print_faults("before");

    volatile char sink = 0;

    if (strcmp(argv[1], "read") == 0) {
        static char buf[FILE_SIZE];
        ssize_t n = read(fd, buf, FILE_SIZE);
        if (n > 0) sink ^= buf[0];
    } else {
        char *p = mmap(NULL, FILE_SIZE, PROT_READ, MAP_PRIVATE, fd, 0);
        for (size_t i = 0; i < FILE_SIZE; i += pgsz)
            sink ^= p[i];
        munmap(p, FILE_SIZE);
    }

    (void)sink;
    print_faults("after");
    close(fd);
    return 0;
}
```

*Source: [mmap_file.c](https://github.com/youssef62/mmap_experiments/blob/master/experiments/mmap_file/mmap_file.c)*

Here are the `strace` commands we will use to trace the system calls made by our program:

```sh
dd if=/dev/urandom of=testfile.bin bs=16384 count=16 status=none
sudo purge # clear the page cache
./mmap_file mmap testfile.bin | tee results_mmap.txt
```

We show the results after the `openat(..., "testfile.bin", ..)` system call. 

```
openat(AT_FDCWD, "testfile.bin", O_RDONLY) = 3
read(3, "\260\273\250|;\363\363\350\353G\177\253\2624Y\334\257\353\4n\1772*\320\226\24x\360\264\315\223\377"..., 262144) = 262144
```

*Full trace: [strace_read.txt](https://github.com/youssef62/mmap_experiments/blob/master/experiments/mmap_file/strace_read.txt)*

We have 1 `read()` system call that reads the entire file into the page cache[^page-cache]. The kernel will then map the page cache to our virtual memory. 

Let's now see the results when we use `mmap()` to access the file:

```
openat(AT_FDCWD, "testfile.bin", O_RDONLY) = 3
mmap(NULL, 262144, PROT_READ, MAP_PRIVATE, 3, 0) = 0xffffa6af0000
munmap(0xffffa6af0000, 262144)          = 0
```

*Full trace: [strace_mmap.txt](https://github.com/youssef62/mmap_experiments/blob/master/experiments/mmap_file/strace_mmap.txt)*

We have the `mmap()` system call that maps the file into our virtual memory and the `munmap()` system call that unmaps the file from our virtual memory. But we do not have a system call for reading the file into the page cache. This is because the kernel will read the file into the page cache **when a page fault occurs**.

To check that, we will print the number of page faults before and after accessing the file. We will use the `getrusage()` system call to get the number of page faults[^major-minor-fault]. I run this experiment on my mac and I get the following results:

`read`:
```
[before] majflt=37
[after] majflt=37
```
`mmap`:
```
[before] majflt=114
[after] majflt=130
```

We can see, that we have 16 major page faults when we use `mmap()` to access the file. One per page fault. 

Note: This experiment was run macOS, as opposed to Linux through docker like the previous experiments. With the docker setup, I was only seing one 1 major page fault when using `mmap()` to access the file. I am not sure why this is the case. 

*Conclusion: When we read a `mmap`ed file through virtual memory, either that address is mapped to a page in the page cache or it will trigger a page fault and the kernel will read the file into the page cache.*

## How good is `mmap` for large sequential reads compared to `read()`?


We measured both approaches on files of increasing size on macOS. For each size, we open the file, walk through it once (one byte per page for `mmap`, 1 MiB chunks for `read`) and record the wall time. The full benchmark is in [mmap_file_bench.c](https://github.com/youssef62/mmap_experiments/blob/master/experiments/profile_macos/mmap_file_bench.c).

Results (seconds):

::: {.compact}

| size    | read | mmap |
|---------|-----:|-----:|
| 4 MiB   | 0.02 | 0.01 |
| 16 MiB  | 0.01 | 0.04 |
| 64 MiB  | 0.01 | 0.10 |
| 256 MiB | 0.06 | 0.54 |
| 1 GiB   | 0.20 | 1.84 |
| 4 GiB   | 3.77 | 7.72 |

![read vs mmap sweep](https://raw.githubusercontent.com/youssef62/mmap_experiments/master/experiments/profile_macos/sweep.png)

:::

`read()` wins clearly as soon as the file is more than a few MiB. The reason is that `mmap` pays one page fault per 4 KiB page: each fault traps into the kernel, allocates a page in the page cache, and updates the process page table. For a 1 GiB file that is 262144 faults, all on the critical path. `read()` on the other hand asks the kernel to copy a large chunk in a single syscall, which lets the kernel issue big sequential I/Os and amortize the per-call overhead.

*Conclusion: for a large sequential scan, `read()` is faster than `mmap()`.*

## Conclusion

We saw what `mmap` does and how it works. We also investigated how `malloc` uses `mmap` for large allocations and how `mmap` can be used to access files. We benchmarked `mmap` and `read()` for large sequential reads and found that `read()` is faster than `mmap()` for large files. The reason, as our last experiment showed, is that `mmap` pays one page fault per page while `read()` can copy a large chunk in a single syscall.


---

[^virtual-memory]: **virtual memory**: an abstraction of the memory resources that are available to a process. Each process can access its own virtual address space, without worrying about the physical memory of the machine.

[^process]: **process**: a program in execution. Isolated from other processes. In particular, each process has its own virtual address space.

[^page]: **page**: a fixed-size block of contiguous memory.

[^kernel]: **kernel**: the part of an OS that manages the system's important resources (the CPU, memory, and I/O devices). 

[^page-fault]: **page fault**: occurs when a process accesses a virtual address whose page is not currently mapped in its page table.

[^page-table]: **page table**: a table that maps virtual addresses to physical addresses.

[^page-cache]: **page cache**: a cache of pages in memory that have been read from disk.

[^major-minor-fault]: **major/minor page fault**: a major page fault occurs when the kernel has to read the page from disk to satisfy the access. A minor page fault occurs when the page is already in RAM (e.g. in the page cache) but not yet wired into the process's page table, so the kernel can satisfy the request without going to disk.

