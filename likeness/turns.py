"""What the app asks for, as the studio receives it. Validated here so that engines can trust what they are given."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Op = Literal["create", "edit", "restyle", "reference", "blend", "region", "backdrop", "remove", "vary", "angles"]
Pace = Literal["quick", "fine", "deep"]
Handle = Annotated[str, StringConstraints(pattern=r"^[A-Z]{1,8}$")]


class Ref(BaseModel):
    asset: str = Field(max_length=40)
    # look: a picture whose look (a cut, a colour, make-up, clothes) is borrowed for the subject; marks: the subject with
    # the person's own marks drawn on it, showing where and how to change it
    role: Literal["style", "backdrop", "with", "look", "marks"] = "with"


class Intent(BaseModel):
    """The app's own reading of the request. The engine reads the words again and may disagree."""
    op: Op = "create"
    subject: str | None = Field(None, max_length=40)
    refs: list[Ref] = Field(default_factory=list, max_length=8)


class Pin(BaseModel):
    n: int = Field(ge=1, le=9)
    note: str = Field("", max_length=1200)   # a look mixed from several parts, with marks and a reference, says a lot
    print: str | None = Field(None, max_length=40)
    mask: str | None = Field(None, max_length=40)


class LookIn(BaseModel):
    id: str | None = Field(None, max_length=80)
    name: str = Field(max_length=80)
    prompt: str = Field("", max_length=800)


class BackdropIn(BaseModel):
    name: str = Field(max_length=120)
    words: str = Field(max_length=400)


class RoomIn(BaseModel):
    id: str = Field("", max_length=80)
    name: str = Field("", max_length=80)
    line: str = Field("", max_length=200)
    colors: dict[str, str] = Field(default_factory=dict)
    voice: list[str] = Field(default_factory=list, max_length=8)


class Turn(BaseModel):
    id: str = Field(max_length=64)
    text: str = Field("", max_length=4000)
    pace: Pace = "fine"
    n: int = Field(1, ge=1, le=4)
    handles: dict[Handle, str] = Field(default_factory=dict, max_length=12)   # "A" -> asset id
    intent: Intent = Field(default_factory=Intent)
    look: LookIn | None = None
    backdrop: BackdropIn | None = None
    subject_mask: str | None = Field(None, max_length=40)
    pins: list[Pin] = Field(default_factory=list, max_length=9)
    room: RoomIn | None = None
    mood: str | None = Field(None, max_length=40)
    taste: str = Field("", max_length=600)   # what the person always wants, in their words

    def asset_ids(self) -> list[str]:
        ids = list(self.handles.values()) + [r.asset for r in self.intent.refs] + [p.mask for p in self.pins if p.mask]
        ids += [x for x in (self.intent.subject, self.subject_mask) if x]
        return list(dict.fromkeys(ids))

    def handle_of(self, asset_id: str | None) -> str | None:
        return next((h for h, a in self.handles.items() if a == asset_id), None)


class RoomAsk(BaseModel):
    text: str = Field(max_length=300)
    palette: list[str] | None = Field(None, max_length=8)


class LookAsk(BaseModel):
    text: str = Field("", max_length=300)
    asset: str | None = Field(None, max_length=40)


class BackdropAsk(BaseModel):
    text: str = Field("", max_length=300)
    near: float = Field(0.5, ge=0, le=1)
    dream: float = Field(0.4, ge=0, le=1)
    room: str = Field("", max_length=80)
    asset: str | None = Field(None, max_length=40)


@dataclass
class Inputs:
    """A turn's pictures, resolved to files on disk, named by their handles."""
    pictures: dict[str, Path] = field(default_factory=dict)       # "A" -> file
    subject: str | None = None                                     # handle of the picture to change
    refs: list[tuple[str, str]] = field(default_factory=list)      # (handle, role)
    pins: list[tuple[int, str, Path | None]] = field(default_factory=list)   # (number, note, mask file)
    subject_mask: Path | None = None
