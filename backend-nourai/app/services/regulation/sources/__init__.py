"""One parser per official list; importing this package registers every source."""
from app.services.regulation.sources import (  # noqa: F401
    ca_cosmetic_hotlist,
    eu_cosing,
    eu_food_additives,
    us_fda_colour_additives,
    us_fda_cosmetics,
    us_fda_food_substances,
)
