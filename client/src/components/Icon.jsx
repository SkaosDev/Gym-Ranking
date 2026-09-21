import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { iconFor } from './icons.js';

/**
 * Icons are decoration. They are hidden from assistive technology and never
 * focusable, so the meaning always comes from the text or the button label
 * beside them.
 */
export default function Icon({ name, icon, className, fixedWidth = false }) {
  return (
    <FontAwesomeIcon
      icon={icon ?? iconFor(name)}
      className={className}
      fixedWidth={fixedWidth}
      aria-hidden="true"
      focusable="false"
    />
  );
}
