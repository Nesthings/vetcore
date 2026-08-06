from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    identifier: str = Field(description="Email para staff/owner, o email del super-admin")
    password: str


class UserIdLoginRequest(BaseModel):
    user_id: str = Field(description="Id del usuario de staff (tarjeta del login con foto)")
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
    full_name: str | None = None
    photo_url: str | None = None
    setup_completed: bool | None = None


class ActivateRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)
