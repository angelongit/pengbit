// tidalByte 26 pet shell: parametric handheld case
// Parts: XIAO nRF52840 Sense, 0.96" SSD1306 I2C OLED, EEMB LP603449 1100 mAh LiPo,
// three 6x6 tact buttons, 12 mm active buzzer, mini slide switch.
//
// Coordinates: X = width, Y = height (+Y is the top, where the screen is),
// Z = thickness (Z=0 is the back face, Z=D is the front face).
// Render one part at a time:  openscad -D 'part="front"' -o front.stl pet_shell.scad

/* [Render] */
part = "assembly"; // [assembly, exploded, front, back, caps, check]

/* [Shell] */
W = 46;          // outer width
H = 90;          // outer height
D = 18.5;          // outer thickness
R = 10;          // plan-view corner radius
er = 3;          // roundover on front and back edges
wall = 2.0;      // wall thickness
z_split = 10.5;    // where the two halves meet
lip_h = 3;       // height of the snap lip on the back half
lip_t = 1.2;     // lip thickness
tol = 0.2;       // clearance between lip and front wall (raise to 0.3 if too tight)
snap = true;     // little detent bumps on the lip
lanyard = true;  // keychain loop on top
back_text = "tidalByte";

/* [Battery EEMB LP603449] */
bat = [34.5, 51, 6.3];      // measure yours: width, length, thickness
bat_clear = 0.6;
bat_top_y = 40.5;        // top edge of the battery pocket

/* [XIAO nRF52840 Sense] */
xiao = [17.5, 21];       // board width, length
xiao_t = 1.2;            // PCB thickness
xiao_x = -6;             // board center X
xiao_z = 3.5;            // underside of the PCB (room for wires on the BAT pads)
usb_w = 12.5;            // USB-C opening, fits most cable plugs
usb_h = 7.5;
usb_ctr_z = xiao_z + xiao_t + 1.6;

/* [OLED module] */
oled = [27.3, 27.8];     // PCB width, height (header pins on the top edge)
oled_glass_t = 1.6;      // glass thickness above the PCB
oled_y = 25.5;             // PCB center Y
oled_win = [24, 13.5];   // window opening (active area is about 21.7 x 10.9)
oled_win_off = 1.0;      // window center offset from PCB center, toward the header
oled_clear = 0.3;

/* [Buttons] */
btn_xy = [[-13, 3], [0, 0.5], [13, 3]];   // A, B, C (a little smile)
btn_labels = ["A", "B", "C"];
tact = 6.3;              // tact switch body + clearance
tact_body_h = 3.5;       // body height (without the stem)
tact_stem_h = 1.5;       // stem height above the body
cap_d = 7.5;             // knob diameter
cap_flange_d = 10;
cap_flange_t = 1.2;
cap_proud = 1.5;         // how far the knob sticks out of the face

/* [Buzzer] */
bz_d = 12;
bz_h = 9.5;
bz_xy = [10.5, -30];

/* [Slide switch] */
sw_body = [8.6, 4.5, 4.4];  // length along wall, depth into case, height
sw_y = -24;                 // center of the switch along the right side wall
sw_z = 2.5;                 // underside of switch body
sw_slot = [6.0, 2.6];       // lever slot: width (travel + lever), height

/* [Hidden] */
$fn = 48;
eps = 0.01;
inW = W - 2*wall;
inH = H - 2*wall;
zin_front = D - wall;       // inner surface of the front face
font = "Liberation Sans:style=Bold";

// ---------- basic shapes ----------
module outline(o = 0) {
    offset(r = R + o) square([W - 2*R, H - 2*R], center = true);
}

module body_solid() {
    steps = 6;
    hull() for (i = [0:steps]) {
        a = 90 * i / steps;
        o = -er + er * cos(a);
        translate([0, 0, er - er * sin(a)]) linear_extrude(eps) outline(o);
        translate([0, 0, D - er + er * sin(a) - eps]) linear_extrude(eps) outline(o);
    }
}

module cavity(z0, z1) {
    translate([0, 0, z0]) linear_extrude(z1 - z0) outline(-wall);
}

module rrect(size, r, h) {
    linear_extrude(h) offset(r = r) square([size[0] - 2*r, size[1] - 2*r], center = true);
}

// ---------- back half ----------
module back_shell() {
    difference() {
        union() {
            difference() {
                intersection() { body_solid(); translate([-W, -H, -1]) cube([2*W, 2*H, z_split + 1]); }
                cavity(wall, z_split + 1);
            }
            // snap lip
            translate([0, 0, z_split - eps]) linear_extrude(lip_h + eps)
                difference() { outline(-wall - tol); outline(-wall - tol - lip_t); }
            if (snap) for (sx = [-1, 1], y = [-25, 22])
                translate([sx * (inW/2 - tol), y, z_split + lip_h/2])
                    rotate([90, 0, 0]) cylinder(r = 0.55, h = 10, center = true, $fn = 16);
            battery_retainers();
            xiao_cradle();
            switch_holder();
            if (lanyard) lanyard_tab();
        }
        // USB-C opening
        translate([xiao_x, -H/2, usb_ctr_z])
            rotate([-90, 0, 0]) translate([0, 0, -1]) rrect([usb_w, usb_h], 2, wall + 2);
        // slide switch lever slot
        translate([inW/2 - 1, sw_y - sw_slot[0]/2, sw_z + sw_body[2]/2 - sw_slot[1]/2])
            cube([wall + 2, sw_slot[0], sw_slot[1]]);
        // engraved name on the back (mirrored so it reads from behind)
        if (len(back_text) > 0)
            translate([0, 12, -eps]) linear_extrude(0.6) mirror([1, 0, 0])
                text(back_text, size = 6, font = font, halign = "center", valign = "center");
    }
}

module battery_retainers() {
    bw = bat[0] + bat_clear; bl = bat[1] + bat_clear;
    cy = bat_top_y - bl/2;
    // L-shaped corner brackets, 3 mm tall; wires can leave anywhere between them
    for (sx = [-1, 1], sy = [-1, 1])
        translate([sx * bw/2, cy + sy * bl/2, wall - eps]) mirror([sx < 0 ? 1 : 0, 0, 0]) mirror([0, sy < 0 ? 1 : 0, 0])
            linear_extrude(3) {
                translate([0, -7]) square([1.2, 8.2]);
                translate([-7, 0]) square([8.2, 1.2]);
            }
}

module xiao_cradle() {
    yb = -inH/2 + 0.3;            // board bottom edge (USB end)
    yt = yb + xiao[1];
    for (sx = [-1, 1]) {
        // ledge under the board edge
        translate([xiao_x + sx * (xiao[0]/2 - 0.75) - 0.75, yb + 3, wall - eps])
            cube([1.5, xiao[1] - 3, xiao_z - wall + eps]);
        // side guide
        translate([xiao_x + sx * (xiao[0]/2 + 0.3 + 0.6) - 0.6, yb + 3, wall - eps])
            cube([1.2, xiao[1] - 3, xiao_z + xiao_t + 1 - wall]);
    }
    // stop at the far end of the board
    translate([xiao_x - 4, yt + 0.3, wall - eps]) cube([8, 1.2, xiao_z + xiao_t + 1 - wall]);
}

module switch_holder() {
    // switch lies against the right side wall, lever pointing out through it
    x0 = inW/2;
    translate([x0 + eps, sw_y, 0]) rotate([0, 0, 90]) {
        translate([-sw_body[0]/2, 0, wall - eps]) cube([sw_body[0], sw_body[1], sw_z - wall + eps]);
        for (sx = [-1, 1])
            translate([sx * (sw_body[0]/2 + 0.2) + (sx > 0 ? 0 : -1.2), 0, wall - eps])
                cube([1.2, sw_body[1], sw_z + sw_body[2] - wall]);
    }
}

module lanyard_tab() {
    difference() {
        hull() {
            translate([0, H/2 + 4, 0]) cylinder(r = 5, h = 3.5);
            translate([-6, H/2 - 3.5, 0]) cube([12, 1, 3.5]);
        }
        translate([0, H/2 + 4, -1]) cylinder(r = 2.2, h = 6);
        cavity(wall, 10);
    }
}

// ---------- front half ----------
module front_shell() {
    difference() {
        union() {
            difference() {
                intersection() { body_solid(); translate([-W, -H, z_split]) cube([2*W, 2*H, D]); }
                cavity(z_split - 1, zin_front);
            }
            oled_frame();
            for (p = btn_xy) btn_socket(p);
            buzzer_socket();
        }
        // screen window, chamfered toward the face
        translate([0, oled_y + oled_win_off, zin_front - eps])
            hull() {
                rrect(oled_win, 1, eps);
                translate([0, 0, wall + 2*eps]) rrect(oled_win + [2*wall, 2*wall], 2, eps);
            }
        // button holes
        for (p = btn_xy) translate([p[0], p[1], zin_front - 1]) cylinder(d = cap_d + 0.5, h = wall + 2);
        // button labels
        for (i = [0:2]) translate([btn_xy[i][0], btn_xy[i][1] - 8.5, D - 0.5])
            linear_extrude(1) text(btn_labels[i], size = 3.5, font = font, halign = "center", valign = "center");
        // buzzer sound holes
        for (p = [[0,0],[0,3],[0,-3],[2.6,1.5],[2.6,-1.5],[-2.6,1.5],[-2.6,-1.5]])
            translate([bz_xy[0] + p[0], bz_xy[1] + p[1], zin_front - 1]) cylinder(d = 1.6, h = wall + 2, $fn = 16);
        // sparkle on the chin
        translate([-10, bz_xy[1], D - 0.6]) linear_extrude(1) sparkle(5);
        // detent grooves
        if (snap) for (sx = [-1, 1], y = [-25, 22])
            translate([sx * inW/2, y, z_split + lip_h/2])
                rotate([90, 0, 0]) cylinder(r = 0.65, h = 11, center = true, $fn = 16);
        // pry notch on the left side
        translate([-W/2 - 1, -5, z_split - eps]) cube([1 + 1.0, 8, 0.8]);
    }
}

module sparkle(s) {
    for (a = [0, 90]) rotate(a) scale([1, 0.42]) circle(d = s * 2, $fn = 4);
}

module oled_frame() {
    fw = oled + [2*oled_clear, 2*oled_clear];
    h = oled_glass_t + 1.1 + 1.0;  // glass + PCB + a little to grab
    translate([0, oled_y, zin_front - h + eps])
        linear_extrude(h) difference() {
            offset(delta = 1.2) square(fw, center = true);
            square(fw, center = true);
            // gap at the header edge for wires
            translate([0, fw[1]/2]) square([16, 4], center = true);
        }
}

function sock_outer() = cap_flange_d + 0.6 + 2*1.0;

module btn_socket(p) {
    bore_h = cap_flange_t + 0.4;
    z_body_bot = zin_front - bore_h - tact_stem_h - tact_body_h;
    so = sock_outer();
    translate([p[0], p[1], 0]) difference() {
        translate([-so/2, -so/2, z_body_bot]) cube([so, so, zin_front - z_body_bot + eps]);
        translate([0, 0, zin_front - bore_h]) cylinder(d = cap_flange_d + 0.6, h = bore_h + 1);
        translate([-tact/2, -tact/2, z_body_bot - 1]) cube([tact, tact, zin_front]);
        // leg slots
        translate([-so/2 - 1, -tact/2, z_body_bot - 1]) cube([so + 2, tact, 2.2]);
    }
}

module buzzer_socket() {
    translate([bz_xy[0], bz_xy[1], zin_front - 4.5])
        difference() {
            cylinder(d = bz_d + 0.4 + 2.4, h = 4.5 + eps);
            translate([0, 0, -1]) cylinder(d = bz_d + 0.4, h = 7);
        }
}

// ---------- button caps ----------
module cap() {
    cylinder(d = cap_flange_d, h = cap_flange_t);
    translate([0, 0, cap_flange_t - eps]) cylinder(d = cap_d, h = wall + 0.4 + cap_proud - 0.6);
    translate([0, 0, cap_flange_t + wall + 0.4 + cap_proud - 0.6 - eps])
        scale([1, 1, 0.6 / (cap_d/2)]) intersection() {
            sphere(d = cap_d); translate([-cap_d, -cap_d, 0]) cube(2*cap_d);
        }
}

module caps() { for (i = [0:2]) translate([i * 14, 0, 0]) cap(); }

// ---------- dummy parts for checking fit ----------
module dummy_parts() {
    bl = bat[1];
    // battery
    color("silver") translate([-bat[0]/2, bat_top_y - bat_clear/2 - bl, wall]) cube([bat[0], bl, bat[2]]);
    // XIAO + USB-C receptacle
    color("blue") translate([xiao_x - xiao[0]/2, -inH/2 + 0.3, xiao_z]) cube([xiao[0], xiao[1], xiao_t]);
    color("gray") translate([xiao_x - 4.5, -inH/2 - 0.2, xiao_z + xiao_t]) cube([9, 7.5, 3.2]);
    // OLED: glass, PCB, trimmed header (2.5 spacer + 2.5 pins)
    color("black") translate([-26.7/2, oled_y - 19.3/2, zin_front - oled_glass_t]) cube([26.7, 19.3, oled_glass_t]);
    color("darkblue") translate([-oled[0]/2, oled_y - oled[1]/2, zin_front - oled_glass_t - 1.1]) cube([oled[0], oled[1], 1.1]);
    color("black") translate([-5.1, oled_y + oled[1]/2 - 3.75, zin_front - oled_glass_t - 1.1 - 5]) cube([10.2, 2.5, 5]);
    // tact switches
    for (p = btn_xy) {
        zb = zin_front - cap_flange_t - 0.4 - tact_stem_h - tact_body_h;
        color("dimgray") translate([p[0] - 3, p[1] - 3, zb]) cube([6, 6, tact_body_h]);
        color("dimgray") translate([p[0], p[1], zb + tact_body_h]) cylinder(d = 3.5, h = tact_stem_h);
    }
    // buzzer
    color("black") translate([bz_xy[0], bz_xy[1], zin_front - bz_h]) cylinder(d = bz_d, h = bz_h);
    // slide switch body
    color("white") translate([inW/2 - sw_body[1], sw_y - sw_body[0]/2, sw_z]) cube([sw_body[1], sw_body[0], sw_body[2]]);
}

// ---------- output ----------
if (part == "front") translate([0, 0, D]) rotate([180, 0, 0]) front_shell();  // print face down
else if (part == "back") back_shell();
else if (part == "caps") caps();
else if (part == "check") {
    // anything rendered here is a collision between parts and shell
    intersection() { union() { back_shell(); front_shell(); } dummy_parts(); }
}
else if (part == "exploded") {
    color("#7fd3e8") back_shell();
    dummy_parts();
    color("#c9a6ff", 0.9) translate([0, 0, 25]) front_shell();
    for (p = btn_xy) color("#ffd166") translate([p[0], p[1], 25 + zin_front - cap_flange_t - 0.4]) cap();
}
else if (part == "assembly") {
    color("#7fd3e8") back_shell();
    color("#c9a6ff") front_shell();
    for (p = btn_xy) color("#ffd166") translate([p[0], p[1], zin_front - cap_flange_t - 0.4 + 0.4]) cap();
}
