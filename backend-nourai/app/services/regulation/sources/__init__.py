"""One parser per official list; importing this package registers every source."""
from app.services.regulation.sources import eu_cosing, eu_food_additives  # noqa: F401
