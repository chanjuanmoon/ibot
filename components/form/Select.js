import React, { PureComponent } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import DocumentEvents from 'react-document-events'

import get from 'lodash/get'
import isArray from 'lodash/isArray'

import Dropdown from '../dropdown'
import { Input } from './Input'
import { Ellipsis } from '../text'

import { trimList, $, $$, SVG, preparePortal } from '../util'
import { positionMenu } from '../dropdown/util'
import { getOptionLabel, getOptionValue, checkOptionByValue } from './util'

import './index.styl'

const MENU_ROOT_ID = 'MB_SELECT_MENU_ROOT'
const CANT_SCROLL_CLASS = 'mb-cant-scroll'

const { I18N = {} } = window

export const $menuRoot = (
  document.getElementById(MENU_ROOT_ID)
  || Object.assign(document.createElement('div'), { id: MENU_ROOT_ID })
)

const $body = document.body

if (!$body.contains($menuRoot)) {
  $body.appendChild($menuRoot)
}

function controlScrolling({ target, canScroll = false }) {
  const classList = target.classList || document.body.classList
  const action = canScroll ? 'remove' : 'add'
  return classList[action](CANT_SCROLL_CLASS)
}

function enableScrolling() {
  $$(`.${CANT_SCROLL_CLASS}`)
  .forEach($elmt => (
    $elmt.classList.remove(CANT_SCROLL_CLASS)
  ))
}

export class Select extends PureComponent {
  state = {
    isOpen: false,
    value: this.props.value,
  }

  static propTypes = {
    size: PropTypes.oneOf(['regular', 'small']),
    unstyled: PropTypes.bool,
    className: PropTypes.string,
    menuClassName: PropTypes.string,
    placeholder: PropTypes.string,

    /**
     * A valid option list looks like either one below:
     *
     * ['Apple', 'Pencil']
     * ['Apple', { label: <span>Pencil <Icon name="pencil"/></span>, value: 'pencil' }]
     * [{ label: 'Apple', isDisabled: true }, 'Pencil']
     *
     * [
     *  'An apple',
     *  [
     *    'Stationery', // First entry of an array is the title of the group.
     *    'A pen',
     *    'A marker',
     *    {
     *      label: <span>A pencil <Icon name="pencil"/></span>,
     *      value: 'pencil',
     *      isDisabled: true
     *    },
     *  ],
     *  { label: 'Blackberries' },
     * ]
     *
     */
    optionList: PropTypes.arrayOf(
      PropTypes.oneOfType([
        // Regular options:
        PropTypes.node,
        PropTypes.shape({
          label: PropTypes.node,
          value: PropTypes.any,
          isDisabled: PropTypes.bool,
        }),

        // Option groups:
        PropTypes.arrayOf(
          PropTypes.oneOfType([
            PropTypes.node,
            PropTypes.shape({
              label: PropTypes.node,
              value: PropTypes.any,
              isDisabled: PropTypes.bool,
            }),
          ])
        ),
      ])
    ).isRequired,

    value: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.string,
    ]),

    isDisabled: PropTypes.bool,
    onChange: PropTypes.func,

    menuX: PropTypes.oneOf(['left', 'center']),
  }

  static defaultProps = {
    size: 'regular',
    className: '',
    menuClassName: '',
    placeholder: I18N.select_placeholder || 'Choose one…',
    emptyMsg: I18N.select_empty_msg || 'Nothing to display…',
    optionList: [],
    isDisabled: false,
    onChange: () => null,
    menuX: 'left',
  }

  static getDerivedStateFromProps({ value: nextValue }, { value }) {
    if (value !== nextValue) {
      return { value: nextValue }
    }

    return null
  }

  componentDidMount() {
    window.addEventListener('resize', this.onResizeWindow)
  }

  set$select = $select => this.setState({ $select })

  open = () => this.setState({ isOpen: true })
  close = () => this.setState({ isOpen: false })
  toggle = () => this.setState({ isOpen: !this.state.isOpen })

  onResizeWindow = () => this.state.isOpen && this.close()

  onChange = value => this.setState(
    { value },
    () => {
      this.close()
      this.props.onChange(value)
    },
  )

  onSelect = ({ currentTarget: $opt }) => (
    this.onChange($opt.dataset.value)
  )

  get displayText() {
    const { optionList, placeholder } = this.props
    const { value } = this.state

    const group = optionList.find(g => (
      isArray(g) && g.slice(0).some(o => checkOptionByValue(o, value))
    ))

    const option = (group || optionList).find(o => (
      !isArray(o) && checkOptionByValue(o, value)
    ))

    return !!option ? getOptionLabel(option) : placeholder
  }

  render() {
    const {
      size, unstyled,
      className,
      menuX,
      isDisabled,
    } = this.props

    const { isOpen, $select, value } = this.state


    const klass = trimList([
      'Select',
      size,
      unstyled && 'unstyled',
      className,
      isOpen && 'is-open',
      isDisabled && 'is-disabled',
    ])

    return (
      <label
        className={klass}
        role="listbox"
        ref={this.set$select}
      >
        <button type="button" onClick={this.toggle} disabled={isDisabled}>
          <Ellipsis>{ this.displayText }</Ellipsis>
        </button>

        <span className="caret" dangerouslySetInnerHTML={{ __html: SVG.INPUT_ARROW }} />

        <SelectMenu
          isOpen={isOpen}
          {...this.props}
          value={value}
          $select={$select}
          onChange={this.onSelect}
          onClose={this.close}
          menuX={menuX}
        />
      </label>
    )
  }
}

export class SelectMenu extends PureComponent {
  state = {
    isDownward: true,
  }

  portal = preparePortal($menuRoot, 'SelectMenuPortal')

  static propTypes = {
    ...Select.propTypes,
    isOpen: PropTypes.bool,
    onChange: PropTypes.func,
    onClose: PropTypes.func,
    $select: PropTypes.instanceOf(Element),
  }

  static defaultProps = {
    isOpen: false,
  }

  componentDidUpdate({ isOpen: wasOpen, $select }) {
    const { $menuBase } = this
    const { isOpen, menuX } = this.props

    // Set up the position of the <SelectMenu> once opened:
    if (!wasOpen && isOpen) {
      const { isDownward } = positionMenu({
        $menuBase,
        $opener: $select,

        menuX,
        shouldSetMaxHeight: true,
      })

      this.setState({ isDownward })
      this.scrollIntoActive()
    }
  }

  componentWillUnmount() {
    if (this.portal) this.portal.remove()
  }

  /**
   * Workaround for Safari where options in invisible areas are still clickable.
   */
  onChange = e => {
    const { onChange } = this.props
    const { isDownward } = this.state

    const $opt = e.currentTarget
    const $menuBase = $opt.closest('.SelectMenu')

    if (!$opt || !$menuBase) {
      return this.onlose()
    }

    const { top: topOf$opt, bottom: bottomOf$opt } = $opt.getBoundingClientRect()
    const { top: topOf$menuBase, bottom: bottomOf$menuBase } = $menuBase.getBoundingClientRect()

    if (
      isDownward && topOf$opt >= topOf$menuBase
      || !isDownward && bottomOf$opt <= bottomOf$menuBase
    ) {
      if ($opt.classList.contains('title')) return

      return onChange(e)
    }

    return this.onClose()
  }

  onClose = () => {
    const { onClose } = this.props

    onClose()
    enableScrolling()
  }

  set$menuBase = $menuBase => Object.assign(this, { $menuBase })

  scrollIntoActive = () => {
    const $current = $('li[role=option].is-active', this.$menuBase)

    if ($current) {
      $current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  onClickOutside = ({ target }) => {
    const { $select } = this.props

    const isOutsideMenu = !$menuRoot.contains(target)

    const closestLabel = target.closest('label')
    const isOwnLabel = closestLabel && closestLabel.contains($select)

    if (isOutsideMenu && !isOwnLabel) {
      this.onClose()
    }
  }

  onScrollWhileOpen = ({ target }) => {
    const { $menuBase } = this
    const { $select } = this.props
    if (!$menuBase) return

    const isScrollingMenu = $menuBase.contains(target)
    const isCursorOnMenu = $menuBase.matches(':hover')
    const isCursorOnOpener = $select.matches(':hover')

    if (!isScrollingMenu && isCursorOnMenu) {
      controlScrolling({ target, canScroll: false })

    } else if (!isScrollingMenu && !isCursorOnMenu && !isCursorOnOpener) {
      this.onClose()
      controlScrolling({ target, canScroll: true })
    }
  }

  onMouseLeave = () => setTimeout(enableScrolling, 300)

  render() {
    return createPortal(this.renderMenu(), this.portal)
  }

  renderMenu() {
    const {
      isOpen,
      isDisabled,
      menuClassName,
      optionList,
      emptyMsg,
      value,
      menuX,
    } = this.props

    const { isDownward } = this.state

    const isEmpty = optionList.length === 0

    const klass = trimList([
      'SelectMenu',
      menuClassName,
      `x-${menuX}`,
      isOpen && 'is-open',
      isDownward ? 'is-downward' : 'is-upward',
      isDisabled && 'is-disabled',
      isEmpty && 'is-empty',
    ])

    return (
      <div ref={this.set$menuBase} className="SelectMenuBase">
        <ul
          className={klass}
          onTransitionEnd={this.onTransitionEnd}
          onMouseLeave={this.onMouseLeave}
        >
          {
            isEmpty
            ? <li className="SelectOption empty-msg">{ emptyMsg }</li>
            : (
              optionList
              .map((option, idx) => (
                isArray(option)
                ? <Group
                    key={idx}
                    optionList={option}
                    value={value}
                    onChange={this.onChange}
                  />
                : <Option
                    key={idx}
                    isActive={checkOptionByValue(option, value)}
                    option={option}
                    isDisabled={option.isDisabled}
                    onChange={this.onChange}
                  />
              ))
            )
          }

          <DocumentEvents
            enabled={isOpen}
            capture={false}
            onClick={this.onClickOutside}
          />

          <DocumentEvents
            enabled={isOpen}
            capture={true}
            onScroll={this.onScrollWhileOpen}
          />
        </ul>
      </div>
    )
  }
}

function Group({
  value,
  optionList: [title, ...optionList],
  onChange,
}) {
  return (
    <li className="SelectGroup">
      <Ellipsis className="title" onClick={onChange}>{ title }</Ellipsis>

      <ul>
      {
        optionList
        .map((option, idx) => (
          <Option
            key={idx}
            option={option}
            isActive={checkOptionByValue(option, value)}
            isDisabled={option.isDisabled}
            onChange={onChange}
          />
        ))
      }
      </ul>
    </li>
  )
}

Group.propTypes = {
  idx: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  optionList: PropTypes.array,
  onChange: PropTypes.func,
}

function Option({
  option,
  isActive,
  isDisabled,
  onChange,
}) {
  const className = trimList([
    'SelectOption',
    isActive && 'is-active',
    isDisabled && 'is-disabled',
  ])

  const label = getOptionLabel(option)
  const value = getOptionValue(option)

  return (
    <li
      role="option"
      data-value={value}
      className={className}
      onClick={isDisabled ? undefined : onChange}
    >
      <Ellipsis>{ label }</Ellipsis>
    </li>
  )
}

Option.propTypes = {
  idx: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  option: PropTypes.oneOfType([
    PropTypes.node,
    PropTypes.object,
  ]),
  isDisabled: PropTypes.bool,
  onChange: PropTypes.func,
}

export function PanelSelect({ className, ...others }) {
  return (
    <Input
      size="small"
      className={trimList(['PanelSelect', className])}
      {...others}
    />
  )
}

PanelSelect.propTypes = {
  className: PropTypes.string,
}