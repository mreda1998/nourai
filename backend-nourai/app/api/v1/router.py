"""API v1 router configuration."""
from fastapi import APIRouter

from app.api.v1 import chat, domains, foods, ingredients, meals, products, stack, users
from app.api.v1.webhooks import revenuecat

api_router = APIRouter()

api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(ingredients.router, prefix="/ingredients", tags=["ingredients"])
api_router.include_router(domains.router, prefix="/domains", tags=["domains"])
api_router.include_router(meals.router, prefix="/meals", tags=["meals"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(stack.router, prefix="/users/me/stack", tags=["stack"])
api_router.include_router(revenuecat.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(foods.router, prefix="/foods", tags=["foods"])
