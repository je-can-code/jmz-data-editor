package mzjson

import (
	"math"
	"strconv"
	"strings"
)

// hexDigits spells control characters in the lowercase hex JSON.stringify uses.
const hexDigits = "0123456789abcdef"

// Compact writes the value on one line, exactly as JavaScript's JSON.stringify(value) would.
func Compact(value *Value) []byte {
	return appendCompact(nil, value)
}

// appendCompact appends the one-line form of the value.
func appendCompact(out []byte, value *Value) []byte {
	switch value.Kind {
	case Bool:
		return append(out, value.Text...)
	case Number:
		return append(out, normalizeNumber(value.Text)...)
	case String:
		return appendString(out, value.Text)
	case Array:
		out = append(out, '[')
		for index, item := range value.Items {
			if index > 0 {
				out = append(out, ',')
			}
			out = appendCompact(out, item)
		}
		return append(out, ']')
	case Object:
		out = append(out, '{')
		for index, member := range value.Members {
			if index > 0 {
				out = append(out, ',')
			}
			out = appendString(out, member.Key)
			out = append(out, ':')
			out = appendCompact(out, member.Value)
		}
		return append(out, '}')
	}

	return append(out, "null"...)
}

// appendString appends a quoted string escaped the way JSON.stringify escapes it.
//
// That is less than Go escapes: only the quote, the backslash and the control characters. `<`, `>`
// and `&` stay as themselves, as do U+2028 and U+2029, and every other character is written raw
// rather than as a \u escape. Walking bytes rather than runes is safe because every byte of a
// multi-byte UTF-8 sequence is 0x80 or above, so none of them can be mistaken for one that needs
// escaping.
func appendString(out []byte, text string) []byte {
	out = append(out, '"')

	start := 0
	for index := 0; index < len(text); index++ {
		character := text[index]
		if character >= 0x20 && character != '"' && character != '\\' {
			continue
		}

		// flush the plain run before this character, then its escape.
		out = append(out, text[start:index]...)
		switch character {
		case '"':
			out = append(out, '\\', '"')
		case '\\':
			out = append(out, '\\', '\\')
		case '\b':
			out = append(out, '\\', 'b')
		case '\f':
			out = append(out, '\\', 'f')
		case '\n':
			out = append(out, '\\', 'n')
		case '\r':
			out = append(out, '\\', 'r')
		case '\t':
			out = append(out, '\\', 't')
		default:
			out = append(out, '\\', 'u', '0', '0', hexDigits[character>>4], hexDigits[character&0xF])
		}
		start = index + 1
	}

	out = append(out, text[start:]...)
	return append(out, '"')
}

// normalizeNumber rewrites a JSON number literal the way JavaScript prints the same number.
//
// A number MZ wrote is already in that form, and so is anything a browser serialized, so almost
// every literal passes through untouched. The rewrite exists for the rest: `1.0`, `1E3` and `-0`
// are valid JSON that JavaScript would never produce, and a file must not end up holding them.
func normalizeNumber(literal string) string {
	// a short plain integer is exact in a double, so JavaScript would print exactly these digits.
	if isShortInteger(literal) {
		if literal == "-0" {
			return "0"
		}
		return literal
	}

	number, err := strconv.ParseFloat(literal, 64)
	if err != nil && math.IsInf(number, 0) == false {
		// not a number at all; the parser never produces one, so keep the text rather than guess.
		return literal
	}

	return formatNumber(number)
}

// isShortInteger reports whether the literal is a plain integer of at most fifteen digits, the
// longest run every one of which a double holds exactly.
func isShortInteger(literal string) bool {
	digits := strings.TrimPrefix(literal, "-")
	if len(digits) == 0 || len(digits) > 15 {
		return false
	}
	if len(digits) > 1 && digits[0] == '0' {
		return false
	}

	for index := 0; index < len(digits); index++ {
		if digits[index] < '0' || digits[index] > '9' {
			return false
		}
	}

	return true
}

// formatNumber prints a double the way JavaScript's Number.prototype.toString does.
//
// Both languages find the same shortest digit string that reads back as the same double; they only
// differ in where they place the decimal point and when they switch to exponent form. This applies
// JavaScript's placement rules (ECMA-262, Number::toString) to the digits Go finds.
func formatNumber(number float64) string {
	// JSON.stringify writes values JSON cannot hold as null, and both zeros as a bare 0.
	if math.IsInf(number, 0) || math.IsNaN(number) {
		return "null"
	}
	if number == 0 {
		return "0"
	}

	// split the shortest form into its sign, digits and exponent.
	text := strconv.FormatFloat(number, 'e', -1, 64)
	sign := ""
	if text[0] == '-' {
		sign = "-"
		text = text[1:]
	}
	mantissa, exponentText, _ := strings.Cut(text, "e")
	exponent, _ := strconv.Atoi(exponentText)
	digits := strings.Replace(mantissa, ".", "", 1)

	// the value is 0.digits times ten to the point, in the specification's terms.
	count := len(digits)
	point := exponent + 1

	switch {
	case count <= point && point <= 21:
		return sign + digits + strings.Repeat("0", point-count)
	case 0 < point && point <= 21:
		return sign + digits[:point] + "." + digits[point:]
	case -6 < point && point <= 0:
		return sign + "0." + strings.Repeat("0", -point) + digits
	}

	// everything else is exponent form, with the exponent's sign always written.
	exponentSign := "+"
	if point-1 < 0 {
		exponentSign = "-"
	}
	magnitude := strconv.Itoa(int(math.Abs(float64(point - 1))))
	if count == 1 {
		return sign + digits + "e" + exponentSign + magnitude
	}

	return sign + digits[:1] + "." + digits[1:] + "e" + exponentSign + magnitude
}
