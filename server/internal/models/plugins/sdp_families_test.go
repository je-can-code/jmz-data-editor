package plugins

import (
	"encoding/json"
	"testing"
)

func TestSdpConfigurationRoundTripPreservesFamilies(t *testing.T) {
	original := SdpConfiguration{
		Sdps: []SdpPanel{},
		Subgroups: []SdpSubgroup{
			{
				Key:  "undead-ghosty",
				Name: "Ghosty",
			},
		},
		Families: []SdpFamily{
			{
				Key:          "undead",
				Name:         "Undead",
				IconIndex:    12,
				Description:  "Spooky panels.",
				SubgroupKeys: []string{"undead-ghosty"},
			},
		},
	}

	bytes, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}

	var decoded SdpConfiguration
	if err := json.Unmarshal(bytes, &decoded); err != nil {
		t.Fatal(err)
	}

	if len(decoded.Families) != 1 {
		t.Fatalf("expected 1 family, got %d", len(decoded.Families))
	}

	if decoded.Families[0].Key != "undead" {
		t.Fatalf("expected family key undead, got %q", decoded.Families[0].Key)
	}

	if len(decoded.Families[0].SubgroupKeys) != 1 || decoded.Families[0].SubgroupKeys[0] != "undead-ghosty" {
		t.Fatalf("unexpected subgroupKeys: %#v", decoded.Families[0].SubgroupKeys)
	}
}
