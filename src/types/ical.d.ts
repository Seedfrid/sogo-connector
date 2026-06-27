// Minimal type surface for ical.js (the package ships no bundled types we rely on).
declare module 'ical.js' {
  export function parse(input: string): unknown;

  export class Component {
    constructor(jCal: unknown);
    getFirstSubcomponent(name: string): Component | null;
    getAllSubcomponents(name: string): Component[];
    getFirstProperty(name: string): Property | null;
    getAllProperties(name: string): Property[];
    getFirstPropertyValue(name: string): unknown;
  }

  export class Property {
    getFirstValue(): unknown;
    getValues(): unknown[];
  }

  export class Time {
    toJSDate(): Date;
  }

  export class Event {
    constructor(component: Component);
    uid: string;
    summary: string;
    description: string;
    location: string;
    startDate: Time | null;
    endDate: Time | null;
  }

  const ICAL: {
    parse: typeof parse;
    Component: typeof Component;
    Property: typeof Property;
    Event: typeof Event;
    Time: typeof Time;
  };
  export default ICAL;
}
