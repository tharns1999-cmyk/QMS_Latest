import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Check } from 'lucide-react';

/**
 * SearchableSelect
 * 
 * Enterprise Autocomplete & Searchable Select Component for QMS Portal.
 * Solves text clipping in native `<select>`, supports rich labels, badges,
 * instant case-insensitive multi-field search, keyboard navigation,
 * and auto-flip positioning rendered via React Portal.
 * 
 * @param {Object} props
 * @param {Array<{ value: string|number, label: string, subLabel?: string, badge?: string, keywords?: string|string[], disabled?: boolean }>} props.options
 * @param {string|number} props.value
 * @param {(value: string|number, option?: Object, event?: Object) => void} props.onChange
 * @param {string} [props.placeholder='เลือกข้อมูล...']
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.emptyMessage='ไม่พบข้อมูลที่ค้นหา']
 * @param {boolean} [props.clearable=false]
 * @param {string} [props.className='']
 * @param {string} [props.name]
 * @param {string} [props.id]
 * @param {boolean} [props.required=false]
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {string} [props.ariaLabel]
 */
export const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'เลือกข้อมูล...',
  disabled = false,
  emptyMessage = 'ไม่พบข้อมูลที่ค้นหา',
  clearable = false,
  className = '',
  name,
  id,
  required = false,
  size = 'md',
  ariaLabel,
  title,
  autoFlip = true,
  maxMenuHeight = 280
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, dropUp: false, maxHeight: maxMenuHeight });

  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize options to object format
  const normalizedOptions = useMemo(() => {
    return (options || []).map((opt) => {
      if (opt !== null && typeof opt === 'object') {
        return {
          value: opt.value ?? '',
          label: opt.label ?? String(opt.value ?? ''),
          subLabel: opt.subLabel || opt.sub_label || opt.description || null,
          badge: opt.badge || null,
          keywords: opt.keywords || null,
          disabled: Boolean(opt.disabled)
        };
      }
      return {
        value: opt ?? '',
        label: String(opt ?? ''),
        subLabel: null,
        badge: null,
        keywords: null,
        disabled: false
      };
    });
  }, [options]);

  // Selected option lookup
  const selectedOption = useMemo(() => {
    if (value === null || value === undefined || value === '') return null;
    return normalizedOptions.find((o) => String(o.value) === String(value)) || null;
  }, [normalizedOptions, value]);

  // Case-insensitive filtering
  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalizedOptions;

    return normalizedOptions.filter((opt) => {
      const label = String(opt.label || '').toLowerCase();
      const sub = String(opt.subLabel || '').toLowerCase();
      const badge = String(opt.badge || '').toLowerCase();
      const val = String(opt.value || '').toLowerCase();
      let kw = '';
      if (Array.isArray(opt.keywords)) {
        kw = opt.keywords.join(' ').toLowerCase();
      } else if (opt.keywords) {
        kw = String(opt.keywords).toLowerCase();
      }

      return (
        label.includes(q) ||
        sub.includes(q) ||
        badge.includes(q) ||
        val.includes(q) ||
        kw.includes(q)
      );
    });
  }, [normalizedOptions, search]);

  // Dynamic positioning with auto-flip and boundary protection
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 800;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const estimatedHeight = Math.min(maxMenuHeight, 44 + Math.max(1, filteredOptions.length) * 44);
    const shouldDropUp = autoFlip && (spaceBelow < estimatedHeight && spaceAbove > spaceBelow);

    const calculatedMaxHeight = shouldDropUp
      ? Math.max(120, Math.min(maxMenuHeight, spaceAbove - 16))
      : Math.max(120, Math.min(maxMenuHeight, spaceBelow - 16));

    const top = shouldDropUp
      ? Math.max(8, rect.top - calculatedMaxHeight - 6)
      : rect.bottom + 6;

    // Viewport clamp for horizontal alignment
    const viewportWidth = window.innerWidth || 1200;
    const left = Math.max(8, Math.min(rect.left, viewportWidth - rect.width - 8));

    setCoords({
      top,
      left,
      width: rect.width,
      dropUp: shouldDropUp,
      maxHeight: calculatedMaxHeight
    });
  }, [autoFlip, maxMenuHeight, filteredOptions.length]);

  // Open/Close toggle
  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      setSearch('');
      setHighlightedIndex(-1);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  }, []);

  // Emit selection
  const selectOption = useCallback((option) => {
    if (!option || option.disabled) return;
    const nextVal = option.value;
    handleClose();
    if (onChange) {
      const syntheticEvent = {
        target: { value: nextVal, name: name || '', id: id || '' },
        currentTarget: { value: nextVal, name: name || '', id: id || '' },
        value: nextVal,
        option
      };
      onChange(nextVal, option, syntheticEvent);
    }
    triggerRef.current?.focus();
  }, [handleClose, onChange, name, id]);

  const handleClear = (e) => {
    e.stopPropagation();
    if (disabled) return;
    if (onChange) {
      const syntheticEvent = {
        target: { value: '', name: name || '', id: id || '' },
        currentTarget: { value: '', name: name || '', id: id || '' },
        value: '',
        option: null
      };
      onChange('', null, syntheticEvent);
    }
    triggerRef.current?.focus();
  };

  // Keyboard Navigation & Escape Isolation
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
      return;
    }

    // When dropdown is OPEN:
    if (e.key === 'Escape') {
      // 1. ISOLATE ESCAPE: Prevent outer Modal from closing
      e.stopPropagation();
      e.preventDefault();
      handleClose();
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev + 1 >= filteredOptions.length ? 0 : prev + 1;
        scrollIndexIntoView(next);
        return next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev - 1 < 0 ? filteredOptions.length - 1 : prev - 1;
        scrollIndexIntoView(next);
        return next;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        selectOption(filteredOptions[highlightedIndex]);
      } else if (filteredOptions.length === 1) {
        selectOption(filteredOptions[0]);
      }
      return;
    }

    if (e.key === 'Tab') {
      handleClose();
    }
  };

  const scrollIndexIntoView = (index) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-select-option]');
    const target = items[index];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
  };

  // Auto-focus search input upon opening
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reposition on window resize or scroll
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    const handleScrollOrResize = () => updatePosition();

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Click outside detection
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      const inTrigger = triggerRef.current && triggerRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inTrigger && !inDropdown) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen, handleClose]);

  // Size styling mapping
  const sizeClasses = {
    sm: 'h-8 px-2.5 text-xs rounded-lg',
    md: 'h-10 px-3.5 text-sm rounded-xl',
    lg: 'h-12 px-4 text-base rounded-xl'
  }[size] || 'h-10 px-3.5 text-sm rounded-xl';

  return (
    <div className={`relative w-full ${className}`}>
      {/* Synchronized native select for screen readers, testing libraries, and HTML form integration */}
      <select
        id={id}
        name={name}
        value={value ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          const opt = normalizedOptions.find((o) => String(o.value) === String(val)) || null;
          if (onChange) {
            onChange(val, opt, e);
          }
        }}
        onFocus={() => triggerRef.current?.focus()}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        tabIndex={-1}
        className="sr-only opacity-0 absolute pointer-events-none -z-10"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0
        }}
      >
        <option value="">{placeholder}</option>
        {normalizedOptions.map((opt, idx) => (
          <option key={`${opt.value}-${idx}`} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Main Trigger Button */}
      <button
        type="button"
        ref={triggerRef}
        data-testid="searchable-select-trigger"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel ? undefined : placeholder}
        title={title}
        className={`w-full flex items-center justify-between text-left border transition-all duration-150 outline-none select-none cursor-pointer ${sizeClasses} ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 text-slate-800 shadow-xs'
            : 'bg-white border-slate-300 hover:border-slate-400 text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 shadow-2xs'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
          {selectedOption ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
              {selectedOption.badge && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {selectedOption.badge}
                </span>
              )}
              <span className="truncate font-medium text-slate-800 leading-normal">
                {selectedOption.label}
              </span>
              {selectedOption.subLabel && (
                <span className="shrink-0 text-xs text-slate-400 font-normal hidden sm:inline truncate">
                  ({selectedOption.subLabel})
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1 text-slate-400">
          {clearable && selectedOption && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="ล้างการเลือก"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleClear(e);
              }}
              className="p-1 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            >
              <X size={14} strokeWidth={2} />
            </span>
          )}
          <ChevronDown
            size={16}
            strokeWidth={2}
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'}`}
          />
        </div>
      </button>

      {/* Floating Dropdown Panel rendered via createPortal into document.body */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          onKeyDown={handleKeyDown}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
            zIndex: 99999
          }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10 shrink-0">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="พิมพ์ค้นหา..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder:text-slate-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div
            ref={listRef}
            role="listbox"
            className="flex-1 overflow-y-auto divide-y divide-slate-50 overscroll-contain custom-scrollbar py-1"
          >
            {filteredOptions.length === 0 ? (
              <div className="py-6 px-4 text-center text-xs text-slate-400 font-medium">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = selectedOption && String(selectedOption.value) === String(opt.value);
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={`${opt.value}-${idx}`}
                    data-select-option
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    onClick={() => selectOption(opt)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`px-3 py-2 text-xs flex items-start gap-2.5 cursor-pointer transition-colors ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed bg-slate-50'
                        : isHighlighted
                        ? 'bg-blue-50 text-blue-900'
                        : isSelected
                        ? 'bg-blue-50/60 text-blue-800 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {/* Selected check indicator */}
                    <div className="pt-0.5 shrink-0 text-blue-600">
                      {isSelected ? <Check size={14} strokeWidth={2.5} /> : <span className="w-3.5 block" />}
                    </div>

                    {/* Content area: supports multiple lines without clipping */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {opt.badge && (
                          <span className="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {opt.badge}
                          </span>
                        )}
                        <span className="whitespace-normal break-words font-medium leading-relaxed">
                          {opt.label}
                        </span>
                      </div>
                      {opt.subLabel && (
                        <p className="text-[11px] text-slate-500 whitespace-normal break-words leading-tight">
                          {opt.subLabel}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SearchableSelect;
