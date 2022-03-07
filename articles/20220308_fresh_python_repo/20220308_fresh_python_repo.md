# 20220308 Fresh Python Repo

1. Create an empty repository in Github, and clone it to your local computer.

    ```bash
    cd demo-repo

    mkdir ops test demo-repo
    # Create boilerplate files
    touch Makefile README.md ops/Dockerfile requirements.txt setup.py
    # Create __init__.py files to make modules
    touch demo-repo/__init__.py test/__init__.py
    ```

2. Create a dummy "hello world" file

    ```bash
    ☯ ~/demo-repo cat demo-repo/demo.py
    import requests

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
