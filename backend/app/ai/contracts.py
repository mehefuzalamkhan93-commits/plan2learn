from dataclasses import dataclass
from enum import Enum
from typing import Literal

from pydantic import BaseModel


class ProviderId(str, Enum):
    OMNIROUTE = "omniroute"
    GROQ = "groq"


class ProviderMode(str, Enum):
    AUTO = "auto"
    OMNIROUTE = "omniroute"
    GROQ = "groq"


class ZenProtocol(str, Enum):
    OPENAI_CHAT_COMPLETIONS = "openai_chat_completions"
    OPENAI_RESPONSES = "openai_responses"
    ANTHROPIC_MESSAGES = "anthropic_messages"
    GOOGLE_GENERATE_CONTENT = "google_generate_content"
    SYSTEM_ONE = "system_one"


class AITaskType(str, Enum):
    CHAT = "CHAT"
    PLAN_GENERATION = "PLAN_GENERATION"
    PROFILE_EXTRACTION = "PROFILE_EXTRACTION"
    RECOMMENDATION = "RECOMMENDATION"
    VIDEO_RANKING = "VIDEO_RANKING"
    PLAN_EXPLANATION = "PLAN_EXPLANATION"
    PLAN_REBUILD = "PLAN_REBUILD"


class AIErrorType(str, Enum):
    NOT_CONFIGURED = "NOT_CONFIGURED"
    AUTH_ERROR = "AUTH_ERROR"
    TIMEOUT = "TIMEOUT"
    RATE_LIMIT = "RATE_LIMIT"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    NETWORK_ERROR = "NETWORK_ERROR"
    INVALID_RESPONSE = "INVALID_RESPONSE"
    UNSUPPORTED_CAPABILITY = "UNSUPPORTED_CAPABILITY"
    PROVIDER_ERROR = "PROVIDER_ERROR"


class MessageRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


@dataclass(frozen=True)
class AIMessage:
    role: MessageRole
    content: str


@dataclass(frozen=True)
class AIRequest:
    task_type: AITaskType
    messages: tuple[AIMessage, ...]
    response_model: type[BaseModel] | None = None
    provider_preference: ProviderId | None = None
    model_preference: str | None = None
    latency_preference: Literal["low", "balanced", "quality"] = "balanced"
    fallback_allowed: bool = True
    max_output_tokens: int = 2048


@dataclass(frozen=True)
class PreparedAIRequest:
    task_type: AITaskType
    messages: tuple[AIMessage, ...]
    response_model: type[BaseModel] | None
    max_output_tokens: int


@dataclass(frozen=True)
class ProviderOutput:
    text: str
    input_tokens: int | None = None
    output_tokens: int | None = None


@dataclass(frozen=True)
class AIResult:
    text: str
    structured: BaseModel | None
    provider: ProviderId
    model: str
    latency_ms: int
    fallback_used: bool
    input_tokens: int | None = None
    output_tokens: int | None = None


@dataclass(frozen=True)
class ProviderHealth:
    provider: ProviderId
    status: Literal[
        "healthy",
        "unavailable",
        "not_configured",
        "model_unavailable",
        "unsupported_capability",
    ]
    model: str | None
    protocol: ZenProtocol | None
    missing_configuration: tuple[str, ...] = ()
    error_type: AIErrorType | None = None
    capabilities: tuple[str, ...] = (
        "text_generation",
        "runtime_schema_validation",
        "health_check",
    )