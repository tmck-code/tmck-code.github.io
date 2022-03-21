# 20220308 Fresh Python Repo

This is a basic method for initialising a python-based repository that aims to have as few boilerplate files and dirs as possible, and to be portable so that you can develop on different OS's/architectures.

> _This blog entry is a WIP, more steps will be added over time_

1. Create an empty repository in Github, and clone it to your local computer.

    ```bash
    cd demo-repo

    mkdir ops test demo-repo
    # Create boilerplate files
    touch Makefile README.md ops/Dockerfile requirements.txt setup.py
    # Create __init__.py files to make modules
    touch demo-repo/__init__.py test/__init__.py
    ```

2. Create a dummy "hello world" file (this will be removed later)

    ```bash
    ☯ ~/demo-repo cat demo-repo/demo.py
    print("hello world")
    ```

    Now your repo should look like this:

    ```bash
    ☯ ~/demo-repo tree
    .
    ├── demo-repo
    │   └── demo.py
    ├── Makefile
    ├── ops
    │   └── Dockerfile
    ├── README.md
    ├── requirements.txt
    ├── setup.py
    └── test

    3 directories, 5 files
    ```

3. Fill in the Dockerfile with the minimum boilerplate
    1. Inherit from the official python docker image with a major version release tag
    2. upgrade apt packages
    3. upgrade pip and install requirements.txt

    ```dockerfile
    FROM python:3.9

    WORKDIR /code
    RUN apt update && apt upgrade -y

    ADD requirements.txt .

    RUN python3 -m pip install --upgrade pip && \
        python3 -m pip install -r requirements.txt

    ADD . .
    ```
