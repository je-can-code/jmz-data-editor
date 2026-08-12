package plugins

import (
	"encoding/json"
	"strings"
	"testing"
)

// A field absent from these structs is dropped on read and again on write, because Load decodes into
// the typed struct and Save re-marshals it. So a block the editor does not name is not merely
// uneditable - it is deleted the first time somebody opens the board and saves.
func TestProficiencyConfigurationRoundTripPreservesKnowledgeBlocks(t *testing.T) {
	original := ProficiencyConfiguration{
		Conditionals: []ProficiencyConditional{},
		KnowledgeTags: []KnowledgeTag{
			{
				Key:         "offensive",
				Name:        "Offensive Knowledge",
				IconIndex:   11,
				Description: "What swinging something teaches.",
			},
			{
				Key:         "defensive",
				Name:        "Defensive Knowledge",
				IconIndex:   22,
				Description: "What blocking something teaches.",
			},
		},
		SkillTypeMapping: map[string][]string{
			"7": {"offensive"},
			"9": {"offensive", "defensive"},
		},
		KnowledgeExchanges: []KnowledgeExchange{
			{
				Key:    "blueprints",
				TagKey: "offensive",
				Cost:   100,
				Output: KnowledgeExchangeOutput{Id: 501, Type: "i", Count: 1},
			},
		},
	}

	bytes, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}

	var decoded ProficiencyConfiguration
	if err := json.Unmarshal(bytes, &decoded); err != nil {
		t.Fatal(err)
	}

	if len(decoded.KnowledgeTags) != 2 {
		t.Fatalf("expected 2 knowledge tags, got %d", len(decoded.KnowledgeTags))
	}

	// the second tag, so a struct that only carried the first would be caught.
	if decoded.KnowledgeTags[1].Key != "defensive" || decoded.KnowledgeTags[1].IconIndex != 22 {
		t.Fatalf("unexpected second tag: %#v", decoded.KnowledgeTags[1])
	}

	if len(decoded.SkillTypeMapping["9"]) != 2 {
		t.Fatalf("expected skill type 9 to map to 2 tags, got %#v", decoded.SkillTypeMapping["9"])
	}

	if len(decoded.KnowledgeExchanges) != 1 {
		t.Fatalf("expected 1 exchange, got %d", len(decoded.KnowledgeExchanges))
	}

	if decoded.KnowledgeExchanges[0].Output.Id != 501 || decoded.KnowledgeExchanges[0].Output.Count != 1 {
		t.Fatalf("unexpected exchange output: %#v", decoded.KnowledgeExchanges[0].Output)
	}
}

// A project that has not authored any knowledge must keep its file exactly as it was. Without
// omitempty every one of these blocks would be written back as null on the first save.
func TestProficiencyConfigurationOmitsUnauthoredKnowledgeBlocks(t *testing.T) {
	original := ProficiencyConfiguration{Conditionals: []ProficiencyConditional{}}

	bytes, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}

	encoded := string(bytes)

	for _, block := range []string{"knowledgeTags", "skillTypeMapping", "knowledgeExchanges"} {
		if strings.Contains(encoded, block) {
			t.Fatalf("expected %q to be omitted when unauthored, got %s", block, encoded)
		}
	}
}

// The plugin iterates a recipe's cost, so a nil slice written back as null would throw at boot rather
// than reading as "this recipe is not for sale".
func TestCraftingConfigurationRoundTripPreservesCost(t *testing.T) {
	original := CraftingConfiguration{
		Recipes: []CraftingRecipe{
			{
				Key:  "sellable",
				Cost: []CraftingComponent{{Id: 501, Type: "i", Count: 3}},
			},
			{
				Key: "not_for_sale",
			},
		},
	}

	bytes, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Contains(string(bytes), `"cost":null`) {
		t.Fatalf("expected an unpriced recipe to omit cost entirely, got %s", string(bytes))
	}

	var decoded CraftingConfiguration
	if err := json.Unmarshal(bytes, &decoded); err != nil {
		t.Fatal(err)
	}

	if len(decoded.Recipes[0].Cost) != 1 {
		t.Fatalf("expected 1 cost component, got %d", len(decoded.Recipes[0].Cost))
	}

	if decoded.Recipes[0].Cost[0].Count != 3 {
		t.Fatalf("unexpected cost component: %#v", decoded.Recipes[0].Cost[0])
	}

	// the near-miss sibling: a recipe with no cost must survive as having none, not as having one.
	if len(decoded.Recipes[1].Cost) != 0 {
		t.Fatalf("expected the unpriced recipe to carry no cost, got %#v", decoded.Recipes[1].Cost)
	}
}
