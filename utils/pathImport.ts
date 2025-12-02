import { PathArtifact, Waypoint, Activity, ActivityDefinition } from '../types';

// Helper to generate UUIDs
const generateId = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

interface YamlWaypoint {
    ID: number;
    latitude_degrees: number;
    longitude_degrees: number;
    tasks: string[];
    duration_s: number[];
}

// Simple YAML parser for the specific format used by Lunagis
// We don't want to add a heavy YAML parser dependency if we can avoid it
const parseYaml = (content: string): YamlWaypoint[] => {
    const lines = content.split('\n');
    const waypoints: YamlWaypoint[] = [];
    let currentWaypoint: Partial<YamlWaypoint> | null = null;
    let currentSection: 'tasks' | 'duration_s' | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (line.startsWith('- ID:')) {
            if (currentWaypoint) {
                waypoints.push(currentWaypoint as YamlWaypoint);
            }
            const id = parseInt(trimmed.replace('- ID:', '').trim());
            currentWaypoint = {
                ID: id,
                tasks: [],
                duration_s: []
            };
            currentSection = null;
        } else if (currentWaypoint) {
            if (trimmed.startsWith('latitude_degrees:')) {
                currentWaypoint.latitude_degrees = parseFloat(trimmed.split(':')[1].trim());
            } else if (trimmed.startsWith('longitude_degrees:')) {
                currentWaypoint.longitude_degrees = parseFloat(trimmed.split(':')[1].trim());
            } else if (trimmed.startsWith('tasks:')) {
                currentSection = 'tasks';
            } else if (trimmed.startsWith('duration_s:')) {
                currentSection = 'duration_s';
            } else if (trimmed.startsWith('-')) {
                const value = trimmed.substring(1).trim();
                if (currentSection === 'tasks') {
                    currentWaypoint.tasks?.push(value);
                } else if (currentSection === 'duration_s') {
                    currentWaypoint.duration_s?.push(parseFloat(value));
                }
            }
        }
    }

    if (currentWaypoint) {
        waypoints.push(currentWaypoint as YamlWaypoint);
    }

    return waypoints;
};

export const parsePathFromYaml = (
    yamlContent: string,
    fileName: string,
    activityDefinitions: ActivityDefinition[]
): PathArtifact => {
    const yamlWaypoints = parseYaml(yamlContent);
    const waypoints: Waypoint[] = [];

    yamlWaypoints.forEach((yw, index) => {
        const activities: Activity[] = [];

        // Process tasks and durations
        if (yw.tasks && yw.duration_s && yw.tasks.length === yw.duration_s.length) {
            yw.tasks.forEach((task, i) => {
                const duration = yw.duration_s[i];

                // Check for Drive-X_Traverse_Y pattern
                const driveMatch = task.match(/^Drive-(\d+)_Traverse_\d+$/);
                if (driveMatch) {
                    const speed = driveMatch[1];
                    // Create a DRIVE activity
                    // We need to find the definition ID for this speed. 
                    // Usually IDs are like 'DRIVE-5', 'DRIVE-10'.
                    // Let's assume the ID format matches 'DRIVE-' + speed
                    const activityId = `DRIVE-${speed}`;

                    // Verify if this ID exists in definitions, otherwise default to DRIVE-5 or similar?
                    // Or just trust the ID construction.
                    activities.push({
                        id: generateId(),
                        type: activityId,
                        duration: 0 // Drive activities usually have 0 duration in the export logic for the traverse task itself, 
                        // but in the internal model they might have a default duration. 
                        // However, the export logic sets duration to 0 for the traverse task line.
                        // In the internal model, 'DRIVE-X' activities are markers.
                    });
                } else if (task === 'Start') {
                    // Ignore Start task or treat as IDLE?
                    // In export, it's just a label for the first waypoint.
                } else {
                    // Find activity definition by name
                    const def = activityDefinitions.find(d => d.name === task);
                    if (def) {
                        activities.push({
                            id: generateId(),
                            type: def.id,
                            duration: duration
                        });
                    } else {
                        console.warn(`Unknown activity task: ${task}`);
                    }
                }
            });
        }

        waypoints.push({
            id: generateId(),
            geoPosition: [yw.longitude_degrees, yw.latitude_degrees],
            label: `WP ${yw.ID}`,
            activities: activities.length > 0 ? activities : undefined
        });
    });

    return {
        id: generateId(),
        name: fileName.replace(/\.(yaml|yml)$/i, ''),
        type: 'path',
        visible: true,
        color: '#00ffff', // Default cyan color
        thickness: 2,
        waypoints
    };
};
