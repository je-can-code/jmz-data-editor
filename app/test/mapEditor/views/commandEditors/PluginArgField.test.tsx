/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { PluginArgSchema } from '../../../../src/mapEditor/core/commands/pluginHeaders/pluginHeader.ts';
import { PluginHeaderLibrary } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { PluginArgField } from '../../../../src/mapEditor/views/commandEditors/PluginArgField.tsx';

/*
 * A plugin argument is text in the command whatever it means, so its input owes the author the text exactly as
 * typed: on screen while they type, even halfway through a number or outside the header's bounds, and handed on
 * unchanged, since a plugin reads the text and nothing else ever should rewrite it. A number outside its bounds is
 * marked, never clamped. A combo takes one of the header's options or text of its own. And a change arriving from
 * anywhere else (an undo, another window) replaces what the input shows.
 */
describe('PluginArgField', () =>
{
  /**
   * Renders one argument over a stored value that stays as it was, as a command does until history answers.
   * @param {PluginArgSchema} arg The argument as the header declares it.
   * @param {string} value The stored value.
   * @returns {{ onChange: ReturnType<typeof vi.fn>, rerender: (value: string) => void }} What the input handed on, and a way to store another value.
   */
  const renderArg = (arg: PluginArgSchema, value: string) =>
  {
    const onChange = vi.fn<(value: string) => void>();
    const library = new PluginHeaderLibrary();
    const view = render(<PluginArgField arg={arg} value={value} onChange={onChange} plugin={'j/time/J-TIME'} library={library}/>);
    const rerender = (next: string) => view.rerender(<PluginArgField arg={arg} value={next} onChange={onChange} plugin={'j/time/J-TIME'} library={library}/>);
    return { onChange, rerender };
  };

  /**
   * A number from 0 to 10.
   */
  const COUNT: PluginArgSchema = { name: 'count', text: 'Count', type: 'number', min: 0, max: 10, default: '1' };

  /**
   * A combo offering two weathers.
   */
  const WEATHER: PluginArgSchema = {
    name: 'weather',
    text: 'Weather',
    type: 'combo',
    options: [ { value: 'rain', label: 'rain' }, { value: 'snow', label: 'snow' } ],
  };

  describe('a number', () =>
  {
    it('keeps a number past its bounds on screen as typed, marked, and hands it on unclamped', () =>
    {
      // Arrange.
      const { onChange } = renderArg(COUNT, '3');
      const input = screen.getByLabelText('Count') as HTMLInputElement;

      // Act.
      fireEvent.change(input, { target: { value: '12' } });

      // Assert.
      expect([ input.value, input.getAttribute('aria-invalid'), onChange.mock.calls ])
        .toStrictEqual([ '12', 'true', [ [ '12' ] ] ]);
    });

    it('keeps a number typed halfway on screen, and hands on exactly what is typed', () =>
    {
      // Arrange.
      const { onChange } = renderArg({ ...COUNT, decimals: 2 }, '3');
      const input = screen.getByLabelText('Count') as HTMLInputElement;

      // Act.
      fireEvent.change(input, { target: { value: '4.' } });

      // Assert: a whole number in bounds is not marked, whatever is still to come.
      expect([ input.value, input.getAttribute('aria-invalid'), onChange.mock.calls ])
        .toStrictEqual([ '4.', 'false', [ [ '4.' ] ] ]);
    });

    it('shows a value changed elsewhere in place of what was typed', () =>
    {
      // Arrange: something typed, then an undo stores another value.
      const { rerender } = renderArg(COUNT, '3');
      const input = screen.getByLabelText('Count') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '12' } });

      // Act.
      rerender('7');

      // Assert.
      expect(input.value)
        .toBe('7');
    });
  });

  describe('a combo', () =>
  {
    it('keeps text of its own on screen as typed, and hands it on', () =>
    {
      // Arrange.
      const { onChange } = renderArg(WEATHER, 'rain');
      const input = screen.getByLabelText('Weather') as HTMLInputElement;

      // Act.
      fireEvent.change(input, { target: { value: 'hail' } });

      // Assert.
      expect([ input.value, onChange.mock.calls.at(-1) ])
        .toStrictEqual([ 'hail', [ 'hail' ] ]);
    });

    it('hands on one of the header\'s options when picked', () =>
    {
      // Arrange.
      const { onChange } = renderArg(WEATHER, 'rain');
      const input = screen.getByLabelText('Weather') as HTMLInputElement;

      // Act.
      fireEvent.change(input, { target: { value: 'sn' } });
      fireEvent.click(screen.getByRole('option', { name: 'snow' }));

      // Assert.
      expect([ input.value, onChange.mock.calls.at(-1) ])
        .toStrictEqual([ 'snow', [ 'snow' ] ]);
    });
  });
});
