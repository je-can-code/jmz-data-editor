import React from 'react';

export type lazyWrapProps = {
  loader: () => Promise<{ default: React.ComponentType<any> }>
};

export function LazyWrap(props: lazyWrapProps)
{
  const Comp = React.lazy(props.loader);
  return (
    <React.Suspense fallback={null}>
      <Comp/>
    </React.Suspense>
  );
}
