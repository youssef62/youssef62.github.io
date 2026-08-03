*I am currently working on loading large language models fast. In this context, I needed to intercept part of a library's internals without modifying its code. This got me looking into how Python's `site` module and `.pth` files work, and how they can be used to hook into arbitrary code. In this post, I document what I learned.*

---
pagetitle: "Intercepting Python Programs Without Modifying Them"
---

# Intercepting Python Programs Without Modifying Them

<a href="/" class="home-button">🏠 Home</a>


<!-- We create a virtual environment:

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
``` -->

*Shims* are a way to intercept and modify the behavior of existing code without changing it. In Python, we can use `.pth` files to create shims that are automatically imported when Python starts. This allows us to hook into arbitrary code and modify its behavior. Before we can start creating shims, we need to understand how Python's import system works and what happens before the first import.
 
## How does Python's import work?

When a Python program imports a module, e.g. `import mymodule`, the following happens:

* Python checks whether this module has already been imported by looking in `sys.modules`. If it has, Python uses the already imported module. 
* Python looks for the module in `sys.path` directories. `sys.path` is a list of directories where Python looks for modules. If the module is found, it is imported and added to `sys.modules` as a module object. If not, an error is raised. 

Example: 

```python 
print("math" in sys.modules)
import math
print("math" in sys.modules)
print(sys.modules["math"])
>>> False
>>> True
>>> <module 'math' from '/opt/homebrew/Cellar/python@3.14/3.14.2_1/Frameworks/Python.framework/Versions/3.14/lib/python3.14/lib-dynload/math.cpython-314-darwin.so'>
```

So we can see that after the import, the `math` module is in `sys.modules` and we can even see the path to its compiled `.so` file. 

## But what happens even before the first import?

Now that we know what `sys.modules` and `sys.path` are, we will be able to understand why Python does the things it does before the first import.

When Python starts, it imports a built-in `site` module:

```python
import sys
print("site" in sys.modules)
>>> True
```

Note that we can use Python's `-S` flag to avoid importing `site`:

```bash
venv/bin/python -S -c "import sys; print('site' in sys.modules)"
>>> False
venv/bin/python  -c "import sys; print('site' in sys.modules)"
>>> True
```

The role of `site` is to prepare the Python interpreter. It:

1. **Adds `site-packages` to `sys.path`.** 

	`sys.path` is a list of directories where Python looks for modules. `site-packages` is where third-party (not standard library) packages are installed.
	
	```python
	[	
		# current directory (modules in our project).
		'',
		# standard library from a zip
		'/opt/homebrew/Cellar/python@3.14/.../python314.zip',
		# standard library
		'/opt/homebrew/Cellar/python@3.14/.../lib/python3.14',
		# compiled code (.so)
		'/opt/homebrew/Cellar/python@3.14/.../lib/python3.14/lib-dynload',
		# site-packages !!
		'/Users/youssefboughizane/../venv/lib/python3.14/site-packages'
	]
	```

	If we run the previous command with `-S` (without `site`), we will not see the last line. Don't trust me, run it!

2. **Processes `.pth` files in `site-packages` directories.** 

	`.pth` files contain paths to directories that we want in `sys.path`. This can, for example, be used to import a library. If you have in `site-packages` a `mypackage-includer.pth` containing `/opt/mypackage/lib/python`, then this path will be added to `sys.path` and `import mypackage` will be possible. Why not install the package directly in `site-packages`? Good question, I am not sure about the answer, but I guess not everyone wants to use a package manager, especially in the early days. Nowadays, we can use these `.pth` files to inject some interesting code in our apps ;)

	Experiment: I will create a package `mypackage` outside our `sys.path`. I will create it in the parent dir of the current project dir with

	```bash
	echo 'print("Hi from mymodule")' > ../mymodule.py
	```

	Let's try to import it:

	```bash
	venv/bin/python -c "import mymodule"
	>>> Traceback (most recent call last):
	>>> File "<string>", line 1, in <module>
	>>>		import mymodule
	>>> ModuleNotFoundError: No module named 'mymodule'
	```

	Fails as expected. Now let's put a `.pth` file that points to it in `site-packages`. First, we create the `.pth` with the path of our parent `$(pwd)/..`.
	
	```bash
	echo "$(pwd)/.." > venv/lib/python3.14/site-packages/mymodule-includer.pth
	```
	
	Now we can test again.
	
	```bash
	venv/bin/python -c "import mymodule"              
	Hi from mymodule
	```

	Amazing! This means we have at least a partially correct understanding of this. Note that `.pth` files can also contain code, we will explore this later.

3. **Imports `sitecustomize` from `sys.path` directories.** 

	The `sitecustomize.py` file is here to let you customize your Python. At startup, Python will do `import sitecustomize` which loops through `sys.path` in order and imports the first occurrence of `sitecustomize` it finds. Let's test this! Let's create a `sitecustomize.py` in the current dir.

	```bash
	echo 'print("Hi from custom sitecustomize.py")' > sitecustomize.py
	```
	Let's launch Python code that just imports `sys` and that has the current dir prepended to `sys.path`.

	```bash
	PYTHONPATH=$PWD venv/bin/python -c "import sys"
	Hi from custom sitecustomize.py
	``` 
	Fantastic.

## Let's have fun intercepting `print`

Enough theory, let's start living. We saw that:

- Python automatically imports a module `site`
- `site` executes all the `.pth` files in `site-packages`.
- `.pth` files can contain code. In particular, they can import a module that we create.
- If this module is in `sys.path`, it will be imported and executed. 


With these observations, we can cook up a way to intercept Python's `print` function. We will create a function that intercepts `print`, we will import its module in a `.pth` file, and we will put that `.pth` file in `site-packages`. This way, when Python starts, it will import our module and our function will intercept `print`.

So here's our `my_print_hook.py` module that will intercept `print`.

```python
import builtins

_original_print = builtins.print

def intercepted_print(*args, **kwargs):
    _original_print("[INTERCEPTED INSIDE MY PRINT: ]", *args, **kwargs)

builtins.print = intercepted_print
```


<!-- For that we will create a fake print function in `venv/lib/python3.14/site-packages/my_print_hook.py`. -->

Now let's create a `.pth` file that will import this module.

```bash
echo "import my_print_hook" > "$SITE/my_print_hook.pth"
```

where $SITE is the path to `site-packages`.

Now, the `.pth` will try to import `my_print_hook` but it will not find it in `sys.path`. We can fix that with `PYTHONPATH`: when we prefix a command with `PYTHONPATH=<path>`, Python will prepend `<path>` to `sys.path`. 


Let's test it!

```bash
venv/bin/python -c "print('hello')"
>>> hello

PYTHONPATH=$(pwd) venv/bin/python -c "print('hello')"
>>> [INTERCEPTED INSIDE MY PRINT WITH PYTHONPATH: ] hello
```

Ouh la la, we have successfully intercepted the print function.

In this case, only Python processes that have or inherit `PYTHONPATH` set to the current dir will have the intercepted `print`. 

*What if we want all the processes to have the intercepted `print`?*

We can put `my_print_hook.py` in `site-packages` and it will be imported by all processes. Let's try that: we'll move our local `my_print_hook.py` to `site-packages` and change it to print a different message.

```python
import builtins

_original_print = builtins.print

def intercepted_print(*args, **kwargs):
    _original_print("[INTERCEPTED INSIDE MY PRINT WITH SITEPACKAGES: ]", *args, **kwargs)

builtins.print = intercepted_print
```

Running it: 

```python
venv/bin/python -c "print('hello')" 
>>> [INTERCEPTED INSIDE MY PRINT WITH SITEPACKAGES: ] hello
```

Voilà, the `my_print_hook.pth` imports `my_print_hook` and, given that `site-packages` is in `sys.path`, the `my_print_hook.py` is imported and the `print` function is intercepted.

## Conclusion

I got interested in this because, when working on loading large models, I was using a custom high-bandwidth program to load the model to `/dev/shm` (RAM) and then providing this path to the engine (sglang). I then wanted to overlap the staging to `/dev/shm` with the engine initialization, to hide the staging cost. For this I needed a barrier between the two phases: if the staging was not finished, the engine would wait. The issue is that this requires us to change sglang's code to add a barrier, which is inconvenient. Using what we learned today, we can intercept `safetensors.safe_open`, add a barrier there that, when satisfied, will let the engine continue. This is a very powerful technique that can be used to modify the behavior of existing code without changing it.
