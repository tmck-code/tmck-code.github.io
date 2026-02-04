# 20260204 Python Repo Practices

- [Setting up a new Python repo](#setting-up-a-new-python-repo)
- [Examples](#examples)
    - [Basic structure](#basic-structure)

---

## Setting up a new Python repo


0. Create the repository via the Github web UI
    - This allows you to add a README.md, and a .gitignore for Python (super handy!)
    - Add a license if desired (BSD-3-Clause is a good default)
    - Clone the repo to your local machine

1. Install uv on your local machine
   - Follow the instructions at https://docs.astral.sh/uv/#installation

2. Create a `pyproject.toml` file
   - Define some basic dependencies in it

3. Run `uv sync` to create the `uv.lock` file

4. Create your dirs

- `ops/` - for Dockerfiles, CI/CD configs, etc.
- `test/` - for your unit tests
- `<your_package_name>/` - for your main package code
  - _make sure it's underscored, not hyphenated_
  - and matches the name in `pyproject.toml`

5. Add a Dockerfile in `ops/` if desired
   - Copy one of the templates from this repo: https://github.com/astral-sh/uv-docker-example

5. Add a `Makefile` for common tasks
   - e.g., `make build`, `make test`, `make lint`, etc.

6. Make sure there is an `__init__.py` file in
    - the `test/` directory
        - This ensures that the tests can be discovered and run properly
    - the main package directory
        - This ensures that the package is recognized as a module

7. Commit and push your changes to GitHub

## Examples

### Basic structure

An example from one of my projects:

```
.
├── LICENSE
├── Makefile
├── README.md
├── abn_lookup_service
│   └── lookup.py
├── ops
│   ├── Dockerfile
├── pyproject.toml
├── test
│   ├── __init__.py
│   └── test_lookup.py
└── uv.lock
```

