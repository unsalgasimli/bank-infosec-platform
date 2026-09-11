/**
 * Expressbank Cyber Sea Battle (Battleship) Engine
 * Mathematical fleet placement algorithms, collision detection, and blind radar grid helpers.
 */

export interface ShipCoordinate {
  row: number; // 0..9
  col: number; // 0..9
}

export interface ShipSpec {
  typeId: string;
  nameAz: string;
  nameEn: string;
  size: number;
  count: number;
  icon: string;
}

export interface PlacedShip {
  id: string;
  typeId: string;
  name: string;
  size: number;
  coordinates: ShipCoordinate[];
  isSunk?: boolean;
}

export interface ShotRecord {
  row: number;
  col: number;
  result: "MISS" | "HIT" | "SUNK";
  sunkShip?: { id: string; name: string; size: number; coordinates: ShipCoordinate[] };
  byUserId: string;
  timestamp: string;
}

export const FLEET_SPECS: ShipSpec[] = [
  { typeId: "flagship", nameAz: "Fladşip (Flagship)", nameEn: "Flagship", size: 4, count: 1, icon: "Anchor" },
  { typeId: "cruiser", nameAz: "Kiber Kruizer (Cruiser)", nameEn: "Cyber Cruiser", size: 3, count: 2, icon: "Shield" },
  { typeId: "destroyer", nameAz: "Eskadra Gəmisi (Destroyer)", nameEn: "Destroyer", size: 2, count: 3, icon: "Zap" },
  { typeId: "patrol", nameAz: "Kəşfiyyat Dronu (Patrol)", nameEn: "Patrol Drone", size: 1, count: 4, icon: "Radio" },
];

export const GRID_SIZE = 10;
export const GRID_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
export const GRID_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Check if a ship of given size can legally be placed at (row, col)
 */
export function canPlaceShip(
  placedShips: PlacedShip[],
  row: number,
  col: number,
  size: number,
  isHorizontal: boolean,
  excludeShipId?: string
): { canPlace: boolean; coordinates: ShipCoordinate[] } {
  const coords: ShipCoordinate[] = [];

  // Check bounds
  if (isHorizontal) {
    if (col + size > 10 || row < 0 || row > 9) return { canPlace: false, coordinates: [] };
    for (let s = 0; s < size; s++) {
      coords.push({ row, col: col + s });
    }
  } else {
    if (row + size > 10 || col < 0 || col > 9) return { canPlace: false, coordinates: [] };
    for (let s = 0; s < size; s++) {
      coords.push({ row: row + s, col });
    }
  }

  // Check collision with other ships (including diagonal/adjacent touches if standard naval spacing applies)
  const otherShips = placedShips.filter((s) => s.id !== excludeShipId);
  const occupiedOrPerimeter = new Set<string>();

  for (const ship of otherShips) {
    for (const c of ship.coordinates) {
      // Mark ship cell and 8 adjacent cells around it
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          occupiedOrPerimeter.add(`${c.row + dr},${c.col + dc}`);
        }
      }
    }
  }

  for (const c of coords) {
    if (occupiedOrPerimeter.has(`${c.row},${c.col}`)) {
      return { canPlace: false, coordinates: coords };
    }
  }

  return { canPlace: true, coordinates: coords };
}

/**
 * Procedural auto-deploy random placement of full 10-ship fleet
 */
export function generateRandomFleet(): PlacedShip[] {
  const fleet: PlacedShip[] = [];
  let shipId = 1;

  for (const spec of FLEET_SPECS) {
    for (let i = 0; i < spec.count; i++) {
      let placed = false;
      let attempts = 0;

      while (!placed && attempts < 400) {
        attempts++;
        const isHorizontal = Math.random() > 0.5;
        const row = Math.floor(Math.random() * 10);
        const col = Math.floor(Math.random() * 10);

        const check = canPlaceShip(fleet, row, col, spec.size, isHorizontal);
        if (check.canPlace) {
          fleet.push({
            id: `fleet_ship_${shipId++}`,
            typeId: spec.typeId,
            name: spec.nameAz,
            size: spec.size,
            coordinates: check.coordinates,
            isSunk: false,
          });
          placed = true;
        }
      }
    }
  }

  return fleet;
}

/**
 * Check if the user has completed placing all required ships
 */
export function isFleetDeploymentComplete(ships: PlacedShip[]): boolean {
  if (!Array.isArray(ships)) return false;
  const targetTotal = FLEET_SPECS.reduce((acc, s) => acc + s.count, 0); // 10 ships
  return ships.length === targetTotal;
}

/**
 * Given a set of sunk ships, returns set of coordinate keys ("r,c") that are adjacent perimeter cells
 */
export function getSunkPerimeterKeys(sunkShips: { coordinates: ShipCoordinate[] }[]): Set<string> {
  const perim = new Set<string>();
  for (const ship of sunkShips) {
    for (const c of ship.coordinates) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = c.row + dr;
          const nc = c.col + dc;
          if (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 9) {
            perim.add(`${nr},${nc}`);
          }
        }
      }
    }
  }

  // Exclude the ship's own cells
  for (const ship of sunkShips) {
    for (const c of ship.coordinates) {
      perim.delete(`${c.row},${c.col}`);
    }
  }

  return perim;
}
