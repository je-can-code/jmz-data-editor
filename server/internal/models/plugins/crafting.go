package plugins

// CraftingConfiguration is the root shape of data/config.crafting.json (J-Crafting++ editor export).
type CraftingConfiguration struct {
	Recipes    []CraftingRecipe   `json:"recipes"`
	Categories []CraftingCategory `json:"categories"`
}

// CraftingRecipe is one craftable row in the configuration.
type CraftingRecipe struct {
	Key                string              `json:"key"`
	Name               string              `json:"name"`
	IconIndex          int                 `json:"iconIndex"`
	Description        string              `json:"description"`
	UnlockedByDefault  bool                `json:"unlockedByDefault"`
	MaskedUntilCrafted bool                `json:"maskedUntilCrafted"`
	CategoryKeys       []string            `json:"categoryKeys"`
	Tools              []CraftingComponent `json:"tools"`
	Ingredients        []CraftingComponent `json:"ingredients"`
	Outputs            []CraftingComponent `json:"outputs"`
}

// CraftingComponent is a single tool, ingredient, or output slot (database id + kind letter).
type CraftingComponent struct {
	Id    int    `json:"id"`
	Type  string `json:"type"`
	Count int    `json:"count"`
}

// CraftingCategory is a recipe grouping row in the configuration.
type CraftingCategory struct {
	Key               string `json:"key"`
	Name              string `json:"name"`
	IconIndex         int    `json:"iconIndex"`
	Description       string `json:"description"`
	UnlockedByDefault bool   `json:"unlockedByDefault"`
}
