package mzjson

import "testing"

// OrderLike owes its callers one thing: after it runs, every object that has a counterpart in the
// template lists its keys in the template's order, with keys the template lacks kept after them in
// their own order, and no value anywhere changed. That is what lets a save put a map back exactly as
// it found it even when the client sent every key in a different order.

// TestOrderLikeFollowsTheTemplate covers the matching rules one at a time.
func TestOrderLikeFollowsTheTemplate(t *testing.T) {
	cases := []struct {
		name     string
		value    string
		template string
		expected string
	}{
		{
			name:     "keys take the template's order",
			value:    `{"a":1,"b":2,"c":3}`,
			template: `{"c":0,"a":0,"b":0}`,
			expected: `{"c":3,"a":1,"b":2}`,
		},
		{
			name:     "keys the template lacks follow in their own order",
			value:    `{"d":4,"a":1,"e":5,"b":2}`,
			template: `{"b":0,"a":0}`,
			expected: `{"b":2,"a":1,"d":4,"e":5}`,
		},
		{
			name:     "keys only the template has change nothing",
			value:    `{"b":2,"a":1}`,
			template: `{"a":0,"gone":0,"b":0}`,
			expected: `{"a":1,"b":2}`,
		},
		{
			name:     "nested objects follow their counterparts",
			value:    `{"outer":{"y":1,"x":2}}`,
			template: `{"outer":{"x":0,"y":0}}`,
			expected: `{"outer":{"x":2,"y":1}}`,
		},
		{
			name:     "array elements follow the element at the same index",
			value:    `[{"b":1,"a":2},{"b":3,"a":4},{"b":5,"a":6}]`,
			template: `[{"a":0,"b":0},{"b":0,"a":0}]`,
			expected: `[{"a":2,"b":1},{"b":3,"a":4},{"b":5,"a":6}]`,
		},
		{
			name:     "a counterpart of another kind is ignored",
			value:    `{"list":{"b":1,"a":2}}`,
			template: `{"list":[{"a":0,"b":0}]}`,
			expected: `{"list":{"b":1,"a":2}}`,
		},
		{
			name:     "a repeated template key counts from its first appearance",
			value:    `{"a":1,"b":2}`,
			template: `{"b":0,"a":0,"b":0}`,
			expected: `{"b":2,"a":1}`,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			value := mustParse(t, testCase.value)
			template := mustParse(t, testCase.template)

			// Act.
			OrderLike(value, template)

			// Assert.
			actual := string(Compact(value))
			if actual != testCase.expected {
				t.Errorf("ordered %s, expected %s", actual, testCase.expected)
			}
		})
	}
}

// TestOrderLikeWithoutATemplateChangesNothing covers a new file, which has no template at all.
func TestOrderLikeWithoutATemplateChangesNothing(t *testing.T) {
	// Arrange.
	value := mustParse(t, `{"b":1,"a":2}`)

	// Act.
	OrderLike(value, nil)

	// Assert.
	if actual := string(Compact(value)); actual != `{"b":1,"a":2}` {
		t.Errorf("ordered %s with no template", actual)
	}
}
