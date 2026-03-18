# 20260318 Converting SQLAlchemy records to dictionaries

My solution takes advantage of the `__dict__` attribute of the SQLAlchemy model instances. It does a couple of extra things

- Skip the `_sa_instance_state` attribute
- Recursively convert any attributes that are also instances of the `Base` class
- Recusively convert any attributes that are mappings or iterables (except for strings and bytes)
  - Preserving the original type of the mapping or iterable (e.g. list/set/dict etc)

```python
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping, Optional

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import Integer, String, DateTime

class Base(DeclarativeBase):
    __abstract__ = True

    @staticmethod
    def _convert_value(v: Any) -> Any:
        if isinstance(v, Base):
            return v.asdict()
        elif isinstance(v, Mapping):
            return type(v)({kk: Base._convert_value(vv) for kk, vv in v.items()})
        elif isinstance(v, Iterable) and not isinstance(v, (str, bytes)):
            return type(v)([Base._convert_value(el) for el in v])
        else:
            return v

    def asdict(self) -> dict[str, Any]:
        return {k: self._convert_value(v) for k, v in self.__dict__.items() if k != '_sa_instance_state'}


class User(Base):
    __tablename__ = 'users'

    id:         Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    email:      Mapped[str]           = mapped_column(String(255), unique=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255))
    last_name:  Mapped[Optional[str]] = mapped_column(String(255))
```
