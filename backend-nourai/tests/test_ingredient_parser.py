from app.services.ingestion.parser import parse_off_ingredients


def test_structured_parser_preserves_nested_order_and_parent():
    parsed = parse_off_ingredients(
        {
            "ingredients": [
                {
                    "text": "Vitamin blend",
                    "ingredients": [
                        {"text": "Vitamin C", "percent_estimate": 2.5},
                        {"text": "Vitamin E"},
                    ],
                },
                {"text": "Water"},
            ]
        }
    )

    assert [item.order_path for item in parsed] == ["1", "1.1", "1.2", "2"]
    assert parsed[1].parent_path == "1"
    assert parsed[1].percentage == 2.5
    assert [item.normalized_text for item in parsed] == [
        "vitamin blend",
        "vitamin c",
        "vitamin e",
        "water",
    ]


def test_text_parser_splits_top_level_but_not_compound_commas():
    parsed = parse_off_ingredients(
        {
            "ingredients_text": (
                "Vitamin blend (Vitamin C, Vitamin E), Soy lecithin (emulsifier); Salt"
            )
        }
    )

    assert [item.order_path for item in parsed] == ["1", "1.1", "1.2", "2", "3"]
    assert parsed[3].qualifiers == {"parenthetical": "emulsifier"}
    assert parsed[4].normalized_text == "salt"


def test_text_parser_separates_percentage_from_resolution_name():
    parsed = parse_off_ingredients({"ingredients_text": "Vitamin C 2%, Zinc"})
    assert parsed[0].normalized_text == "vitamin c"
    assert parsed[0].percentage == 2.0
