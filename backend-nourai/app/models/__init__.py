"""SQLAlchemy 2.0 models."""

from app.models.product import Product, ProductIngredient, ProductCategory, IngredientStatus
from app.models.ingredient import Ingredient, IngredientCategory, IngredientRole, ResearchStatus
from app.models.ingredient_evidence import IngredientEvidence, StudyType, EvidenceDirection
from app.models.ingredient_biodomain_score import IngredientBioDomainScore
from app.models.claim import Claim, ClaimSource, EvidenceStrength
from app.models.user import UserProfile, UserStackEntry, BiologicalSex, TimeOfDay
from app.models.subscription import Subscription, SubscriptionTier, SubscriptionStatus
from app.models.unmatched_ingredient_log import UnmatchedIngredientLog  # noqa: F401
from app.models.chat_message import ChatMessage  # noqa: F401
from app.models.ingredient_interaction import IngredientInteraction  # noqa: F401
from app.models.ingestion import (  # noqa: F401
    DataSource,
    SourceRecord,
    IngestionJob,
    ProductIdentifier,
    ProductRevision,
    ProductIngredientOccurrence,
    ProductAsset,
    IngredientAlias,
    IngredientExternalIdentifier,
    QualityIssue,
    ReviewTask,
)
from app.models.identity import Substance, SubstanceAlias, NameResolution  # noqa: F401
from app.models.pathway import (  # noqa: F401
    BioEntity,
    MechanismFact,
    IngredientMechanismAsset,
    PathwayRoute,
    RouteNode,
    RouteLink,
    RouteClaim,
)
from app.models.laboratory import (  # noqa: F401
    LabDataset,
    LabSample,
    LabAnalysis,
    LabObservation,
    LabInterpretation,
)

__all__ = [
    # Product
    "Product",
    "ProductIngredient",
    "ProductCategory",
    "IngredientStatus",
    # Ingredient
    "Ingredient",
    "IngredientCategory",
    "ResearchStatus",
    # Ingredient evidence
    "IngredientEvidence",
    "StudyType",
    "EvidenceDirection",
    # Biodomain scores
    "IngredientBioDomainScore",
    # Claim
    "Claim",
    "ClaimSource",
    "EvidenceStrength",
    # User
    "UserProfile",
    "UserStackEntry",
    "BiologicalSex",
    "TimeOfDay",
    # Subscription
    "Subscription",
    "SubscriptionTier",
    "SubscriptionStatus",
    # Unmatched ingredient log
    "UnmatchedIngredientLog",
    # Chat
    "ChatMessage",
    # Ingredient interactions
    "IngredientInteraction",
    # Ingestion and provenance
    "DataSource",
    "SourceRecord",
    "IngestionJob",
    "ProductIdentifier",
    "ProductRevision",
    "ProductIngredientOccurrence",
    "ProductAsset",
    "IngredientAlias",
    "IngredientExternalIdentifier",
    "QualityIssue",
    "ReviewTask",
    # Laboratory evidence
    "LabDataset",
    "LabSample",
    "LabAnalysis",
    "LabObservation",
    "LabInterpretation",
]
