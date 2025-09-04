declare module '@noriginmedia/react-spatial-navigation' {
  import { ComponentType } from 'react'

  export interface FocusableComponentLayout {
    left: number
    top: number
    width: number
    height: number
    x: number
    y: number
  }

  export interface FocusableComponentProps {
    focused: boolean
    hasFocusedChild: boolean
    parentFocusKey: string
    realFocusKey: string
    preferredChildFocusKey?: string
    parentContext: any
    forceFocus: () => void
    pauseSpatialNavigation: () => void
    resumeSpatialNavigation: () => void
    setFocus: (focusKey?: string) => void
    navigateByDirection: (direction: string, focusKey: string) => void
    updateAllLayouts: () => void
  }

  export interface FocusableOptions {
    focusKey?: string
    realFocusKey?: string
    preferredChildFocusKey?: string
    onEnterPress?: (props: FocusableComponentProps, details: any) => void
    onArrowPress?: (direction: string, props: FocusableComponentProps, details: any) => boolean
    onFocus?: (
      layout: FocusableComponentLayout,
      props: FocusableComponentProps,
      details: any
    ) => void
    onBlur?: (
      layout: FocusableComponentLayout,
      props: FocusableComponentProps,
      details: any
    ) => void
    extraProps?: any
    trackChildren?: boolean
    forgetLastFocusedChild?: boolean
    autoRestoreFocus?: boolean
    forceFocus?: boolean
    onUpdateFocus?: (focused: boolean) => void
    onUpdateHasFocusedChild?: (hasFocusedChild: boolean) => void
    saveLastFocusedChild?: boolean
  }

  export function withFocusable(options?: FocusableOptions): <T>(
    Component: ComponentType<T>
  ) => ComponentType<T & FocusableComponentProps>

  export function useFocusable(options?: FocusableOptions): {
    ref: React.RefObject<any>
    focused: boolean
    hasFocusedChild: boolean
    setFocus: () => void
    pauseSpatialNavigation: () => void
    resumeSpatialNavigation: () => void
    updateAllLayouts: () => void
    navigateByDirection: (direction: string) => void
  }

  export interface SpatialNavigationConfig {
    debug?: boolean
    visualDebug?: boolean
    nativeMode?: boolean
    throttle?: number
    throttleKeypresses?: boolean
  }

  export function init(config?: SpatialNavigationConfig): void
  export function pause(): void
  export function resume(): void
  export function setKeyMap(keyMap: { [key: string]: number }): void

  export interface SpatialNavigationProps {
    children: React.ReactNode
  }

  export const SpatialNavigation: ComponentType<SpatialNavigationProps>
}