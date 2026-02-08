import React, { ReactNode, ElementType } from 'react';

interface ProviderComposerProps
{
  providers: ElementType[];
  children: ReactNode;
}

const ProviderComposer = ({
  providers,
  children
}: ProviderComposerProps) =>
{
  return (
    <>
      {providers.reduceRight((
        acc,
        Provider
      ) =>
      {
        return <Provider>{acc}</Provider>;
      }, children)}
    </>
  );
};

export { ProviderComposer };
