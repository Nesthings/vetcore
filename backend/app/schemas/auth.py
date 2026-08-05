from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    identifier: str = Field(description="Email para staff/owner, o email del super-admin")
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    sub: str
    clinic_id: str | None = None
    branch_id: str | None = None


class MeResponse(BaseModel):
    sub: str
    role: str
    clinic_id: str | None = None
    branch_id: str | None = None
