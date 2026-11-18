// Pengbit egg shell (tidalByte 26): parametric handheld case
// Parts: XIAO nRF52840 Sense, 0.96" SSD1306 I2C OLED, EEMB LP603449 1100 mAh LiPo,
// three 6x6 tact buttons, 12 mm active buzzer, SS12D00 mini slide switch.
//
// Coordinates: X = width, Y = height (+Y is the top, where USB-C is),
// Z = thickness (Z=0 is the back face, Z=D is the front face).
// Render one part at a time:  openscad -D 'part="front"' -o front.stl pet_shell.scad

/* [Render] */
part = "assembly"; // [assembly, exploded, front, back, caps, check]

/* [Egg shape] */
A  = 34;         // half width at the widest point
Bb = 32;         // bottom half height (rounder)
Bt = 44;         // top half height (more pointed)
n  = 2.3;        // 2 = true ellipse, higher = squarer
D  = 18.5;       // outer thickness
ra = 8;          // radius of the rounded front and back edges
ez = 5;          // how far (in Z) the rounding reaches from each face
wall = 2.0;
z_split = 10.5;  // where the two halves meet
lip_h = 2.5;     // height of the friction lip on the back half
lip_t = 1.2;
tol = 0.15;      // lip clearance: 0.1 tighter, 0.25 looser
back_text = "Pengbit";

/* [Battery EEMB LP603449] */
bat = [51, 34.5, 6.3];   // lies sideways: width, height, thickness
bat_clear = 0.6;
bat_cy = -2;             // battery center Y

/* [XIAO nRF52840 Sense] */
xiao = [17.5, 21];       // board width, length (USB-C end points up)
xiao_t = 1.2;
xiao_x = 0;
xiao_y0 = 17.4;          // bottom edge of the board
xiao_z = 3.5;            // underside of the PCB
usb_w = 12.5;            // USB-C opening, fits most cable plugs
usb_h = 7.5;
usb_ctr_z = xiao_z + xiao_t + 1.6;

/* [OLED module] */
oled = [27.3, 27.8];     // PCB width, height (header pins on the top edge)
oled_glass_t = 1.6;
oled_y = 12;             // PCB center Y
oled_win = [24, 13.5];   // window (active area is about 21.7 x 10.9)
oled_win_off = 1.0;      // window center offset from PCB center, toward the header
oled_clear = 0.3;

/* [Buttons] */
btn_xy = [[-14, -15], [0, -18.5], [14, -15]];   // A, B, C (a smile)
btn_labels = ["A", "B", "C"];
tact = 6.3;
tact_body_h = 3.5;
tact_stem_h = 1.5;
cap_d = 7.5;
cap_flange_d = 10;
cap_flange_t = 1.2;
cap_proud = 1.5;

/* [Buzzer: on the back floor, sound out the back] */
bz_d = 12;
bz_h = 9.5;
bz_xy = [-17.5, 25];

/* [Slide switch: lever out the back] */
sw_body = [4.4, 8.6, 4.5];  // footprint X, Y (lever slides along Y), height
sw_xy = [17, 26];
sw_slot = [2.6, 6.0];       // lever slot X, Y

/* [Hidden] */
$fn = 48;
eps = 0.01;
zin_front = D - wall;
font = "Liberation Sans:style=Bold";

// ---------- egg outline and edge profile ----------
function sgnpow(v, p) = (v < 0 ? -1 : 1) * pow(abs(v), p);
function egg_pt(t) = let(c = cos(t), s = sin(t))
    [A * sgnpow(c, 2/n), (s > 0 ? Bt : Bb) * sgnpow(s, 2/n)];

module egg(o = 0) {
    pts = [for (i = [0:179]) egg_pt(i * 2)];
    if (o == 0) polygon(pts);
    else offset(r = o) polygon(pts);
}

// h = distance from the nearest outer face
function phi(h) = h >= ez ? 0 : asin((ez - h) / ra);
function inset(h) = ra * (1 - cos(phi(h)));
function hface(z) = min(z, D - z);
function cav_inset(z) = inset(hface(z)) + wall / cos(phi(hface(z)));

zs_body = concat([0], [for (i = [1:7]) ez * i / 8], [ez, D - ez], [for (i = [7:-1:1]) D - ez * i / 8], [D]);

module body_solid() {
    hull() for (z = zs_body)
        translate([0, 0, min(max(z, 0), D - eps)]) linear_extrude(eps) egg(-inset(hface(z)));
}

module cavity() {
    zs = concat([wall], [for (i = [1:6]) wall + (ez - wall) * i / 6], [D - ez], [for (i = [5:-1:0]) D - wall - (ez - wall) * i / 6]);
    hull() for (z = zs)
        translate([0, 0, z]) linear_extrude(eps) egg(-cav_inset(z));
}

module rrect(size, r, h) {
    linear_extrude(h) offset(r = r) square([size[0] - 2*r, size[1] - 2*r], center = true);
}

// ---------- back half ----------
module back_shell() {
    difference() {
        union() {
            difference() {
                intersection() { body_solid(); translate([-100, -100, -1]) cube([200, 200, z_split + 1]); }
                cavity();
            }
            // friction lip
            zl = z_split + lip_h;
            translate([0, 0, z_split - eps]) linear_extrude(lip_h + eps)
                difference() { egg(-cav_inset(zl) - tol); egg(-cav_inset(zl) - tol - lip_t); }
            intersection() {
                body_solid();
                union() { battery_retainers(); xiao_cradle(); switch_holder(); buzzer_holder(); }
            }
        }
        // USB-C tunnel out the top
        translate([xiao_x, xiao_y0 + xiao[1] - 1, usb_ctr_z])
            rotate([-90, 0, 0]) rrect([usb_w, usb_h], 2, 30);
        // switch lever slot through the back
        translate([sw_xy[0], sw_xy[1], -1]) rrect(sw_slot, 0.6, wall + 2);
        // buzzer sound holes through the back
        for (p = [[0,0],[0,3],[0,-3],[2.6,1.5],[2.6,-1.5],[-2.6,1.5],[-2.6,-1.5]])
            translate([bz_xy[0] + p[0], bz_xy[1] + p[1], -1]) cylinder(d = 1.6, h = wall + 2, $fn = 16);
        // engraved name (mirrored so it reads from behind)
        if (len(back_text) > 0)
            translate([0, -6, -eps]) linear_extrude(0.6) mirror([1, 0, 0])
                text(back_text, size = 7, font = font, halign = "center", valign = "center");
        // little labels next to the lever and the speaker
        translate([sw_xy[0], sw_xy[1] - 7.5, -eps]) linear_extrude(0.5) mirror([1, 0, 0])
            text("PWR", size = 3, font = font, halign = "center", valign = "center");
    }
}

module battery_retainers() {
    bw = bat[0] + bat_clear; bh = bat[1] + bat_clear;
    for (sx = [-1, 1], sy = [-1, 1])
        translate([sx * bw/2, bat_cy + sy * bh/2, wall - 1])
            mirror([sx < 0 ? 1 : 0, 0, 0]) mirror([0, sy < 0 ? 1 : 0, 0])
                linear_extrude(4) {
                    translate([0, -7]) square([1.2, 8.2]);
                    translate([-7, 0]) square([8.2, 1.2]);
                }
}

module xiao_cradle() {
    yb = xiao_y0;
    for (sx = [-1, 1]) {
        translate([xiao_x + sx * (xiao[0]/2 - 0.75) - 0.75, yb, wall - 1])
            cube([1.5, xiao[1] - 4, xiao_z - wall + 1]);
        translate([xiao_x + sx * (xiao[0]/2 + 0.9) - 0.6, yb, wall - 1])
            cube([1.2, xiao[1] - 4, xiao_z + xiao_t + 1 - wall + 1]);
    }
    // stop under the bottom edge of the board
    translate([xiao_x - 4, yb - 1.5, wall - 1]) cube([8, 1.2, xiao_z + xiao_t + 1 - wall + 1]);
}

module switch_holder() {
    translate([sw_xy[0], sw_xy[1], wall - 1]) linear_extrude(1 + 3)
        difference() {
            square([sw_body[0] + 0.4 + 2.4, sw_body[1] + 0.4 + 2.4], center = true);
            square([sw_body[0] + 0.4, sw_body[1] + 0.4], center = true);
        }
}

module buzzer_holder() {
    translate([bz_xy[0], bz_xy[1], wall - 1]) difference() {
        cylinder(d = bz_d + 0.4 + 2.4, h = 1 + 4);
        translate([0, 0, -1]) cylinder(d = bz_d + 0.4, h = 7);
    }
}

// ---------- front half ----------
module front_shell() {
    sy = oled_y + oled_win_off;
    difference() {
        union() {
            difference() {
                intersection() { body_solid(); translate([-100, -100, z_split]) cube([200, 200, D]); }
                cavity();
            }
            intersection() {
                body_solid();
                union() { oled_frame(); for (p = btn_xy) btn_socket(p); }
            }
        }
        // screen window, chamfered toward the face
        translate([0, sy, zin_front - eps])
            hull() {
                rrect(oled_win, 1, eps);
                translate([0, 0, wall + 2*eps]) rrect(oled_win + [2*wall, 2*wall], 2, eps);
            }
        // button holes
        for (p = btn_xy) translate([p[0], p[1], zin_front - 1]) cylinder(d = cap_d + 0.5, h = wall + 2);
        // button labels
        for (i = [0:2]) translate([btn_xy[i][0], btn_xy[i][1] - 8, D - 0.5])
            linear_extrude(1) text(btn_labels[i], size = 3.2, font = font, halign = "center", valign = "center");
        // penguin face: groove around the screen
        translate([0, sy, D - 0.6]) linear_extrude(1) face_groove();
        // little beak under the screen
        translate([0, sy - 13.5, D - 0.6]) linear_extrude(1)
            polygon([[-3, 1.2], [3, 1.2], [0, -2.2]]);
        // pry notch on the left side at the seam
        translate([-A - 2, -2, z_split - eps]) cube([4, 8, 0.8]);
    }
}

module face_mask() {
    // two overlapping circles with a dip on top: a penguin face patch
    union() {
        translate([-8.5, -1]) circle(r = 13, $fn = 64);
        translate([8.5, -1]) circle(r = 13, $fn = 64);
        translate([0, -6]) scale([1.4, 1]) circle(r = 10, $fn = 64);
    }
}

module face_groove() {
    difference() { offset(r = 0.9) face_mask(); face_mask(); }
}

module oled_frame() {
    fw = oled + [2*oled_clear, 2*oled_clear];
    h = oled_glass_t + 1.1 + 1.0;
    translate([0, oled_y, zin_front - h + eps])
        linear_extrude(h) difference() {
            offset(delta = 1.2) square(fw, center = true);
            square(fw, center = true);
            translate([0, fw[1]/2]) square([16, 4], center = true);
        }
}

function sock_outer() = cap_flange_d + 0.6 + 2*1.0;

module btn_socket(p) {
    bore_h = cap_flange_t + 0.4;
    z_body_bot = zin_front - bore_h - tact_stem_h - tact_body_h;
    so = sock_outer();
    translate([p[0], p[1], 0]) difference() {
        translate([-so/2, -so/2, z_body_bot]) cube([so, so, zin_front - z_body_bot + 1]);
        translate([0, 0, zin_front - bore_h]) cylinder(d = cap_flange_d + 0.6, h = bore_h + eps);
        translate([-tact/2, -tact/2, z_body_bot - 1]) cube([tact, tact, zin_front - bore_h - z_body_bot + 1 + eps]);
        translate([-so/2 - 1, -tact/2, z_body_bot - 1]) cube([so + 2, tact, 2.2]);
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
    color("silver") translate([-bat[0]/2, bat_cy - bat[1]/2, wall]) cube(bat);
    color("blue") translate([xiao_x - xiao[0]/2, xiao_y0, xiao_z]) cube([xiao[0], xiao[1], xiao_t]);
    color("gray") translate([xiao_x - 4.5, xiao_y0 + xiao[1] - 7.3, xiao_z + xiao_t]) cube([9, 7.5, 3.2]);
    color("black") translate([-26.7/2, oled_y - 19.3/2, zin_front - oled_glass_t]) cube([26.7, 19.3, oled_glass_t]);
    color("darkblue") translate([-oled[0]/2, oled_y - oled[1]/2, zin_front - oled_glass_t - 1.1]) cube([oled[0], oled[1], 1.1]);
    color("black") translate([-5.1, oled_y + oled[1]/2 - 3.75, zin_front - oled_glass_t - 1.1 - 5]) cube([10.2, 2.5, 5]);
    for (p = btn_xy) {
        zb = zin_front - cap_flange_t - 0.4 - tact_stem_h - tact_body_h;
        color("dimgray") translate([p[0] - 3, p[1] - 3, zb]) cube([6, 6, tact_body_h]);
        color("dimgray") translate([p[0], p[1], zb + tact_body_h]) cylinder(d = 3.5, h = tact_stem_h);
    }
    color("black") translate([bz_xy[0], bz_xy[1], wall]) cylinder(d = bz_d, h = bz_h);
    color("white") translate([sw_xy[0] - sw_body[0]/2, sw_xy[1] - sw_body[1]/2, wall]) cube(sw_body);
}

// ---------- output ----------
if (part == "front") translate([0, 0, D]) rotate([180, 0, 0]) front_shell();  // print face down
else if (part == "back") back_shell();
else if (part == "caps") caps();
else if (part == "check") intersection() { union() { back_shell(); front_shell(); } dummy_parts(); }
else if (part == "exploded") {
    color("#bfe3f2") back_shell();
    dummy_parts();
    color("#2b3a67", 0.92) translate([0, 0, 25]) front_shell();
    for (p = btn_xy) color("#ff9f43") translate([p[0], p[1], 25 + zin_front - cap_flange_t - 0.4]) cap();
}
else if (part == "assembly") {
    color("#bfe3f2") back_shell();
    color("#2b3a67") front_shell();
    for (p = btn_xy) color("#ff9f43") translate([p[0], p[1], zin_front - cap_flange_t]) cap();
}
