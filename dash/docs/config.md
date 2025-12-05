## Environment setup (Python 2.7)

This document explains how to create and use a conda environment with Python 2.7 named `py27`, and how to install the local `morseapi` package from the repository's `include/` folder.

### 1) Create the conda environment

Create a minimal conda environment that includes Python 2.7 and pip:

```bash
conda create -n py27 python=2.7 pip -y
```

If you prefer to use packages from conda-forge, you can add `-c conda-forge` or install specific packages afterwards. Installing just `python` and `pip` keeps the environment small and predictable.

### 2) Activate the environment

Activate the new environment:

```bash
conda activate py27
```

If `conda activate` fails, ensure your shell is initialized for conda (for bash):

```bash
conda init bash
source ~/.bashrc
# then try again:
conda activate py27
```

### 3) Install `morseapi` from the local `include/` directory

From this file's location (`dash/docs/config.md`) the repository structure looks like this:

- repo-root/
	- dash/
		- docs/
			- config.md   <-- you are here
	- include/
		- morseapi/

So the correct relative path from `dash/docs/` to the package is `../../include/morseapi`.

Recommended install (editable, useful for local development):

```bash
python -m pip install -e ../../include/morseapi
```

Or install a regular (non-editable) copy:

```bash
python -m pip install ../../include/morseapi
```

Using `python -m pip` ensures the `pip` associated with the active conda environment is used.

### 4) Verify the installation

Quick checks you can run inside the activated environment:

```bash
python -c "import morseapi; print('morseapi import OK ->', getattr(morseapi, '__file__', repr(morseapi)))"
python -c "import morseapi; print('morseapi members ->', [k for k in dir(morseapi) if not k.startswith('_')][:20])"
```

Adjust the verification to match how `morseapi` exposes its version or entry points (e.g., `morseapi.__version__` if present).

### 5) Troubleshooting

- If `pip` installs to a global location, make sure the conda environment is activated and use `python -m pip` to be explicit.
- If `conda activate` is not recognized, run `conda init` for your shell and restart the shell.
- If there are build errors while installing `morseapi`, check for missing system libraries or C headers required by dependencies. Consider installing required packages with `conda install` where possible.

### 6) Final note

After following the steps above you should have a working `py27` conda environment with `morseapi` installed from the local `include/morseapi` folder.

You now have everything working.