'ASGI entrypoint: uvicorn babytracker.main:app'

from babytracker.api import create_app

app = create_app()
