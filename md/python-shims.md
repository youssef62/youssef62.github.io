*I am currently working on loading large language models fast. In this context, I needed to intercept part of a library's internals without modifying its code. This got me looking into how Python's `site` module and `.pth` files work, and how they can be used to hook into arbitrary code. In this post, I document what I learned.*

---
title: "Python Shims with .pth files are amazing"
---

<a href="/" class="home-button">🏠 Home</a>

We create a virtual environment:
```sh
python3 -m venv venv
```
Then check what's in `site-packages`:
```
ls venv/lib/python3.14/site-packages
pip                pip-25.3.dist-info
```
And find where `site-packages` lives:
```
venv/bin/python -c 'import site; print(site.getsitepackages()[0])'
/Users/youssefboughizane/Documents/projects/shim/venv/lib/python3.14/site-packages
```

## How does Python's import work?

When Python starts, it imports a built-in `site` module:
```python
import sys

print("site" in sys.modules)
```
```
>>> True
```

Note that we can use Python's `-S` flag to avoid importing `site`:
```
venv/bin/python -S -c "import sys; print('site' in sys.modules)"
False
venv/bin/python  -c "import sys; print('site' in sys.modules)"
True
```

The role of `site` is to prepare the Python interpreter. It:

1. Adds `site-packages` to `sys.path`
	`sys.path` is a list of directories where Python looks for modules. `site-packages` is where third-party (not standard library) packages are installed.
	```
	[	# current directory (modules in our project).
		'',
		# standard library from a zip
 		'/opt/homebrew/Cellar/python@3.14/.../python314.zip',
		# standard library
 		'/opt/homebrew/Cellar/python@3.14/.../lib/python3.14',
		# compiled code (.so)
 		'/opt/homebrew/Cellar/python@3.14/.../lib/python3.14/lib-dynload',
		# site-packages !!
 		'/Users/youssefboughizane/Documents/projects/shim/venv/lib/python3.14/site-packages'
	]
	```
	If we run the previous command with `-S` (without `site`) then we will not see the last line. Don't trust me, run it!

2. Processes `.pth` files in `site-packages` directories
	`.pth` files contain paths to directories that we want in `sys.path`. This can, for example, be used to import a library. If you have in `site-packages` a `mypackage-includer.pth` containing `/opt/mypackage/lib/python`, then this path will be added to `sys.path` and `import mypackage` will be possible. Why not install the package directly in `site-packages`? Good question, I am not sure about the answer, but I guess not everyone wants to use a package manager, especially in the early days. Nowadays, we can use these `.pth` files to inject some interesting code in our apps ;)

	Experiment: I will create a package `mypackage` outside our `sys.path`. I will create it in the parent dir of the current project dir with
	```
	echo 'print("Hi from mymodule")' > ../mymodule.py
	```
	Let's try to import it:
	```
	venv/bin/python -c "import mymodule"
	Traceback (most recent call last):
  	File "<string>", line 1, in <module>
    	import mymodule
	ModuleNotFoundError: No module named 'mymodule'
	```
	Fails as expected. Now let's put in `site-packages` a `.pth` that points to it. First, we create the `.pth` with the path of our parent `$(pwd)/..`.
	```
	echo "$(pwd)/.." > venv/lib/python3.14/site-packages/mymodule-includer.pth
	```
	Now we can test again.
	```
	venv/bin/python -c "import mymodule"              
	Hi from mymodule
	```
	Amazing! This means we have at least a partially correct understanding of this. Note that `.pth` files can also contain code, we will explore this later.

3. Imports `sitecustomize` from `sys.path` directories
	All `sitecustomize.py` files are here to let you customize your Python. At startup, Python will do `import sitecustomize` which loops through `sys.path` in order and imports the first occurrence of `sitecustomize` it finds. Let's test this! Let's create a `sitecustomize.py` in the current dir.
	```
	echo 'print("Hi from custom sitecustomize.py")' > sitecustomize.py
	```
	Let's launch Python code that just imports `sys` and that has the current dir as `sys.path`.
	```
	PYTHONPATH=$PWD venv/bin/python -c "import sys"
	Hi from custom sitecustomize.py
	``` 
	Fantastic.

## Let's have fun intercepting `print`

Enough theory, let's start living. We say that:
- Python automatically imports a module `site`
- `site` executes all the `.pth` files in `site-packages`.
- `.pth` files can contain code.

With these observations, we can cook up a way to intercept Python's `print` function. For that we will create a fake print function in `venv/lib/python3.14/site-packages/my_print_hook.py`.

```python
import builtins

_original_print = builtins.print

def intercepted_print(*args, **kwargs):
    _original_print("[INTERCEPTED INSIDE MY PRINT: ]", *args, **kwargs)

builtins.print = intercepted_print
```
Now let's create a `.pth` file that will import this module.
```
echo "import my_print_hook" > "$SITE/my_print_hook.pth"
```

Let's test it!
```
venv/bin/python -c "print('hello')"
[INTERCEPTED INSIDE MY PRINT: ] hello
```
Ouh la la, we have successfully intercepted the print function.

Note that we don't necessarily need to put `my_print_hook.py` in `venv/lib/python3.14/site-packages/` and can instead use `PYTHONPATH`.

E.g., let's change our local `my_print_hook.py`'s print to
```
def intercepted_print(*args, **kwargs):
    _original_print("[INTERCEPTED INSIDE MY PRINT WITH PYTHONPATH: ]", *args, **kwargs)
```
And keep `site-packages`'s `my_print_hook.py` as is. Now let's test it with `PYTHONPATH`:
```
PYTHONPATH=$PWD venv/bin/python -c "print('Hi')"
[INTERCEPTED INSIDE MY PRINT WITH PYTHONPATH: ] Hi
```
Voilà, the `my_print_hook.pth` imports `my_print_hook` and, given we use `PYTHONPATH=$PWD`, the `my_print_hook.py` in the current dir is imported and not the one in `site-packages`.

This is a cleaner technique; however, our program could spawn other processes that do not have the same `PYTHONPATH`, so putting `my_print_hook.py` in `site-packages` is more radical and will work for all processes.

## Conclusion

I got interested in this because, when working on loading large models, I was using a custom high-bandwidth program to load the model to `/dev/shm` (RAM) and then providing this path to the engine (sglang). I then wanted to overlap the staging to `/dev/shm` with the engine initialization, to hide the staging cost. For this I needed a barrier between the two phases: if the staging was not finished, the engine would wait. The issue is that this requires us to change sglang's code to add a barrier, which is inconvenient. Using what we learned today, we can intercept `safetensors.safe_open`, add a barrier there that, when satisfied, will let the engine continue. This is a very powerful technique that can be used to modify the behavior of existing code without changing it.
