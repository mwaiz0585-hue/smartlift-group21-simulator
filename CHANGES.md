# SmartLift Group 21 v2.2 Suspension Stiffness Update

Added based on feedback:

- New **Suspension Status** panel inside the Vehicle Simulator dashboard.
- Shows **Ride Height** and **Suspension Stiffness** together.
- Different suspension settings by mode:
  - Normal: Normal stiffness, standard ride height.
  - Flood Mode: +150 mm ride height with firmer stabilised control.
  - Pothole Alert: +60 mm ride height with slightly softened/adaptive-soft stiffness.
  - 3-Wheel Mode: adaptive ride height with load-stabilised stiffness.
  - Manual: custom stiffness note when user manually controls wheel modules.
- Pothole area now updates stiffness dynamically between **Slightly Softened** and **Adaptive Soft** while wheel modules cycle.

How to use:
1. Open `index.html`.
2. Go to Vehicle Simulator.
3. Drive into the Rough Road / Potholes zone.
4. Check the new Suspension Status panel on the right dashboard.
