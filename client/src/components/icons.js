/**
 * Every icon the app uses, named by what it means rather than what it looks
 * like, so a page never imports from Font Awesome directly. All of them are
 * bundled by Vite: nothing is fetched at runtime.
 */
import {
  faAnglesUp,
  faArrowsUpDown,
  faBars,
  faChartLine,
  faCheck,
  faCircleInfo,
  faCircleUser,
  faDumbbell,
  faHandFist,
  faHouse,
  faListCheck,
  faPen,
  faPersonArrowDownToLine,
  faPersonArrowUpFromLine,
  faPlus,
  faRightFromBracket,
  faTrash,
  faTriangleExclamation,
  faTrophy,
  faUserGroup,
  faWeightHanging,
  faWeightScale,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

export const ICONS = {
  brand: faDumbbell,
  dashboard: faHouse,
  performances: faListCheck,
  progress: faChartLine,
  friends: faUserGroup,
  profile: faCircleUser,
  logout: faRightFromBracket,

  add: faPlus,
  edit: faPen,
  delete: faTrash,
  confirm: faCheck,
  close: faXmark,
  menu: faBars,

  record: faTrophy,
  bodyweight: faWeightScale,
  warning: faTriangleExclamation,
  info: faCircleInfo,
};

/** One icon per exercise, keyed by the code in the reference table. */
export const EXERCISE_ICONS = {
  squat: faPersonArrowDownToLine,
  bench: faDumbbell,
  deadlift: faWeightHanging,
  ohp: faPersonArrowUpFromLine,
  pullup: faAnglesUp,
  dip: faArrowsUpDown,
  pushup: faHandFist,
};

export const iconFor = (name) => ICONS[name] ?? ICONS.info;
export const exerciseIcon = (code) => EXERCISE_ICONS[code] ?? ICONS.brand;
